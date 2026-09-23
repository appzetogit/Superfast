import mongoose from 'mongoose';
import { config } from './env.js';
import { logger } from '../utils/logger.js';
import dns from 'dns';
import dnsPromises from 'dns/promises';

// Configure public DNS servers globally to avoid Windows SRV/shard resolution failures
try {
    dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
} catch (err) {
    logger.warn(`Could not set global DNS servers: ${err.message}`);
}

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
            srvRecords = await dnsPromises.resolveSrv(`_mongodb._tcp.${host}`);
            try {
                txtRecords = await dnsPromises.resolveTxt(host);
            } catch (e) {
                logger.warn(`No TXT records found or failed to resolve TXT: ${e.message}`);
            }
        } catch (err) {
            logger.warn(`Default DNS resolution failed for SRV record (${err.message}). Retrying with public DNS fallback...`);
            srvRecords = await dnsPromises.resolveSrv(`_mongodb._tcp.${host}`);
            try {
                txtRecords = await dnsPromises.resolveTxt(host);
            } catch (e) {
                logger.warn(`No TXT records found via public DNS: ${e.message}`);
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

const buildDirectAtlasUri = (uri) => {
    try {
        const match = uri.match(/^mongodb\+srv:\/\/([^:]+):([^@]+)@([^/?]+)(?:([/][^?]*))?(?:\?(.*))?$/);
        if (!match) return uri;
        const [, username, password, host, databasePath = '/', queryStr = ''] = match;
        const database = databasePath.replace('/', '');
        const clusterDomain = host.replace(/^[^.]+\./, '');
        const targets = [
            `ac-yg9vrlb-shard-00-00.${clusterDomain}:27017`,
            `ac-yg9vrlb-shard-00-01.${clusterDomain}:27017`,
            `ac-yg9vrlb-shard-00-02.${clusterDomain}:27017`
        ].join(',');
        return `mongodb://${username}:${password}@${targets}/${database}?ssl=true&authSource=admin&replicaSet=atlas-13c5h8-shard-0`;
    } catch {
        return uri;
    }
};

export const connectDB = async (retryCount = 0) => {
    try {
        const resolvedUri = await Promise.race([
            resolveSrvUri(config.mongodbUri),
            new Promise((resolve) => setTimeout(() => resolve(config.mongodbUri), 3000))
        ]);
        const conn = await mongoose.connect(resolvedUri, {
            family: 4, // Force IPv4
            serverSelectionTimeoutMS: 15000,
            connectTimeoutMS: 15000,
        });
        logger.info(`MongoDB connected: ${conn.connection.host}`);
    } catch (error) {
        logger.warn(`Primary connection attempt failed (${error.message}). Retrying with direct URI...`);
        try {
            const directUri = buildDirectAtlasUri(config.mongodbUri);
            const conn = await mongoose.connect(directUri, {
                serverSelectionTimeoutMS: 15000,
                connectTimeoutMS: 15000,
            });
            logger.info(`MongoDB connected via direct shard URI: ${conn.connection.host}`);
        } catch (retryError) {
            logger.error(`MongoDB connection attempt ${retryCount + 1} failed: ${retryError.message}`);
            const maskedUri = config.mongodbUri.replace(/\/\/.*@/, "//***:***@");
            logger.info(`Attempted to connect to: ${maskedUri}`);
            logger.info(`Retrying MongoDB connection in 4 seconds...`);
            await new Promise((res) => setTimeout(res, 4000));
            return connectDB(retryCount + 1);
        }
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
