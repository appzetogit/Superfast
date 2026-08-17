import mongoose from 'mongoose';
import { config } from './env.js';
import { logger } from '../utils/logger.js';
import dns from 'dns/promises';

/**
 * Resiliently resolves a mongodb+srv:// connection string into a standard mongodb:// connection string.
 * This works around DNS query failures for SRV/TXT records (e.g. c-ares bugs on Windows with link-local IPv6 DNS servers)
 * by falling back to public DNS resolvers (8.8.8.8, 1.1.1.1) when default DNS resolution fails.
 */
const resolveSrvUri = async (uri) => {
    if (!uri || !uri.startsWith('mongodb+srv://')) {
        return uri;
    }

    try {
        const match = uri.match(/^mongodb\+srv:\/\/([^:]+):([^@]+)@([^/?]+)(?:([/][^?]*))?(?:\?(.*))?$/);
        if (!match) return uri;

        const [, username, password, host, databasePath = '/', queryStr = ''] = match;
        const database = databasePath.replace('/', '');

        let srvRecords = [];
        let txtRecords = [];

        try {
            srvRecords = await dns.resolveSrv(`_mongodb._tcp.${host}`);
            try {
                txtRecords = await dns.resolveTxt(host);
            } catch (e) {
                logger.warn(`No TXT records found or failed to resolve TXT: ${e.message}`);
            }
        } catch (err) {
            logger.warn(`Default DNS resolution failed for SRV record (${err.message}). Retrying with public DNS fallback...`);
            const originalServers = dns.getServers();
            try {
                dns.setServers(['8.8.8.8', '1.1.1.1']);
                srvRecords = await dns.resolveSrv(`_mongodb._tcp.${host}`);
                try {
                    txtRecords = await dns.resolveTxt(host);
                } catch (e) {
                    logger.warn(`No TXT records found via public DNS: ${e.message}`);
                }
            } finally {
                try {
                    dns.setServers(originalServers);
                } catch (e) { }
            }
        }

        if (!srvRecords || srvRecords.length === 0) {
            throw new Error("No SRV records could be resolved");
        }

        const targets = srvRecords.map(r => `${r.name}:${r.port}`).join(',');

        let txtOptions = {};
        if (txtRecords && txtRecords.length > 0) {
            const txtStr = txtRecords.flat().join('&');
            const searchParams = new URLSearchParams(txtStr);
            for (const [key, val] of searchParams.entries()) {
                txtOptions[key] = val;
            }
        }

        const originalOptions = {};
        if (queryStr) {
            const searchParams = new URLSearchParams(queryStr);
            for (const [key, val] of searchParams.entries()) {
                originalOptions[key] = val;
            }
        }

        const finalOptions = {
            authSource: 'admin',
            ssl: 'true',
            ...txtOptions,
            ...originalOptions
        };

        const optStr = Object.entries(finalOptions)
            .map(([k, v]) => `${k}=${v}`)
            .join('&');

        return `mongodb://${username}:${password}@${targets}/${database}?${optStr}`;
    } catch (err) {
        logger.error(`Resilient SRV DNS resolution failed: ${err.message}. Using original URI.`);
        return uri;
    }
};

export const connectDB = async () => {
    try {
        const resolvedUri = await resolveSrvUri(config.mongodbUri);
        const conn = await mongoose.connect(resolvedUri, {
            family: 4, // Force IPv4
            serverSelectionTimeoutMS: 15000,
            connectTimeoutMS: 15000,
        });
        logger.info(`MongoDB connected: ${conn.connection.host}`);
    } catch (error) {
        logger.error(`MongoDB connection error: ${error.message}`);
        // Log the URI without password for debugging
        const maskedUri = config.mongodbUri.replace(/\/\/.*@/, "//***:***@");
        logger.info(`Attempted to connect to: ${maskedUri}`);
        process.exit(1);
    }
};

/**
 * Close MongoDB connection (e.g. graceful shutdown).
 * @returns {Promise<void>}
 */
export const disconnectDB = async () => {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
};
