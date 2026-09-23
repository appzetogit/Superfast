import React, { useEffect, useState } from "react";
import { Save, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { adminApi } from "../services/adminApi";

const ReturnSettings = () => {
  const [returnWindowDays, setReturnWindowDays] = useState(3);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await adminApi.getReturnSettings();
      const data = response.data || {};
      if (data.success && data.settings) {
        setReturnWindowDays(data.settings.returnWindowDays);
      }
    } catch (error) {
      console.error("Error fetching return settings:", error);
      toast.error("Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await adminApi.updateReturnSettings({ returnWindowDays });
      const data = response.data || {};
      if (data.success) {
        toast.success("Return settings updated successfully");
      } else {
        toast.error("Failed to update settings");
      }
    } catch (error) {
      console.error("Error saving return settings:", error);
      toast.error("An error occurred while saving");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="animate-spin text-emerald-600" size={24} />
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Quick Commerce Return Settings</h1>
        <p className="text-gray-500 text-sm mt-1">Configure global return rules for quick commerce orders.</p>
      </div>

      <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-gray-200 dark:border-neutral-700 p-6 max-w-2xl">
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Return Window (Days)
            </label>
            <input
              type="number"
              value={returnWindowDays}
              onChange={(e) => setReturnWindowDays(Number(e.target.value))}
              min="1"
              max="30"
              className="w-full p-2.5 rounded-lg bg-gray-50 dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 focus:ring-2 focus:ring-emerald-500"
            />
            <p className="text-xs text-gray-500 mt-2">
              Number of days after delivery within which a customer can request a return.
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-medium transition-colors disabled:opacity-70"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReturnSettings;
