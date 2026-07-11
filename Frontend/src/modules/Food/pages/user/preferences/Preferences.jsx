import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, Check, Loader2, AlertCircle, Sparkles, ClipboardList } from "lucide-react";
import { motion } from "framer-motion";
import { preferencesAPI } from "@food/api";
import { toast } from "sonner";
import AnimatedPage from "@food/components/user/AnimatedPage";
import { Card, CardContent } from "@food/components/ui/card";
import { Button } from "@food/components/ui/button";
import { useProfile } from "@food/context/ProfileContext";

export default function Preferences() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEditMode = searchParams.get("edit") === "true";

  const { userProfile, updateUserProfile } = useProfile();

  const [categories, setCategories] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await preferencesAPI.getCategories();
        const cats = res?.data?.data || res?.data || [];
        setCategories(cats);

        // Pre-select existing preferences when in edit mode
        if (isEditMode) {
          const existingPrefs = userProfile?.preferences || [];
          if (existingPrefs.length > 0) {
            const existingIds = existingPrefs.map((p) =>
              typeof p === "string" ? p : String(p._id || p)
            );
            setSelectedIds(existingIds);
          }
        }
      } catch (err) {
        console.error("Failed to load preferences categories:", err);
        setError("Failed to load categories. Please try again.");
      } finally {
        setIsLoading(false);
      }
    };
    fetchCategories();
  }, [isEditMode, userProfile?.preferences]);

  const handleToggle = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    if (selectedIds.length < 1) {
      toast.error("Please select at least 1 category");
      return;
    }
    setIsSaving(true);
    setError("");
    try {
      await preferencesAPI.savePreferences(selectedIds);
      // Sync localStorage
      const storedUser = localStorage.getItem("user");
      if (storedUser) {
        try {
          const userObj = JSON.parse(storedUser);
          userObj.hasSetPreferences = true;
          userObj.preferences = selectedIds;
          localStorage.setItem("user", JSON.stringify(userObj));
          localStorage.setItem("user_user", JSON.stringify(userObj));
        } catch (e) { }
      }
      // Immediately update context state so guards reflect the change
      updateUserProfile({ hasSetPreferences: true, preferences: selectedIds });
      // Also trigger a full context re-fetch via the auth change event
      window.dispatchEvent(new Event("userAuthChanged"));
      if (isEditMode) {
        toast.success("Recommendations updated!");
        navigate(-1);
      } else {
        toast.success("Preferences saved!");
        navigate("/food/user");
      }
    } catch (err) {
      console.error(err);
      setError(err?.response?.data?.message || "Failed to save preferences");
      toast.error("Failed to save preferences");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSkip = async () => {
    setIsSaving(true);
    setError("");
    try {
      await preferencesAPI.savePreferences([]);
      const storedUser = localStorage.getItem("user");
      if (storedUser) {
        try {
          const userObj = JSON.parse(storedUser);
          userObj.hasSetPreferences = true;
          userObj.preferences = [];
          localStorage.setItem("user", JSON.stringify(userObj));
          localStorage.setItem("user_user", JSON.stringify(userObj));
        } catch (e) { }
      }
      updateUserProfile({ hasSetPreferences: true, preferences: [] });
      window.dispatchEvent(new Event("userAuthChanged"));
      navigate("/food/user");
    } catch (err) {
      console.error(err);
      navigate("/food/user");
    } finally {
      setIsSaving(false);
    }
  };

  const BACKEND_ORIGIN =
    typeof window !== "undefined"
      ? window.location.origin.replace(/:\d+$/, ":5000")
      : "";

  const resolveImage = (img) => {
    if (!img || typeof img !== "string") return null;
    if (/^https?:\/\//i.test(img)) return img;
    return `${BACKEND_ORIGIN}${img.startsWith("/") ? img : `/${img}`}`;
  };

  const backPath = isEditMode ? -1 : "/food/user";

  return (
    <AnimatedPage className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a]">
      <div className="max-w-md md:max-w-2xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 py-4 sm:py-6 md:py-8 lg:py-10 pb-28 sm:pb-32">

        {/* Header: Back Arrow + Title + Skip */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 p-0"
              onClick={() => isEditMode ? navigate(-1) : navigate("/food/user")}
            >
              <ArrowLeft className="h-5 w-5 text-black dark:text-white" />
            </Button>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              {isEditMode ? "My Recommendations" : "Choose your favourites"}
            </h1>
          </div>
          {!isEditMode && (
            <button
              onClick={handleSkip}
              disabled={isSaving}
              className="text-sm font-semibold text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-300 transition-colors px-3 py-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              Skip
            </button>
          )}
        </div>

        {/* Subtitle card */}
        <Card className="bg-white dark:bg-[#1a1a1a] rounded-2xl py-0 shadow-sm mb-4 border-0 dark:border-gray-800">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-full p-2 flex-shrink-0">
              <ClipboardList className="h-5 w-5 text-[var(--primary-theme)]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {isEditMode ? "Update your taste profile" : "Personalise your feed"}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                {isEditMode
                  ? "Select cuisines & dishes you love · We'll update your recommendations"
                  : "Pick what you enjoy · See better dishes, restaurants & offers"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Error state */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs font-semibold rounded-2xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Category Grid Card */}
        <Card className="bg-white dark:bg-[#1a1a1a] rounded-2xl py-0 shadow-sm border-0 dark:border-gray-800 mb-4">
          <CardContent className="p-4">
            {/* Section label */}
            <div className="flex items-center gap-2 mb-4 px-1">
              <div className="w-1 h-4 bg-[var(--primary-theme)] rounded" />
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                Food Categories
              </h3>
              {selectedIds.length > 0 && (
                <span className="ml-auto text-xs font-bold text-[var(--primary-theme)] bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 rounded-full">
                  {selectedIds.length} selected
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-square rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse"
                  />
                ))}
              </div>
            ) : categories.length === 0 ? (
              <div className="text-center py-12">
                <div className="bg-gray-100 dark:bg-gray-800 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-3">
                  <AlertCircle className="w-8 h-8 text-gray-400" />
                </div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  No categories available
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {categories.map((cat, idx) => {
                  const isSelected = selectedIds.includes(cat._id);
                  const imageUrl = resolveImage(cat.imageUrl || cat.image);
                  return (
                    <motion.div
                      key={cat._id}
                      onClick={() => handleToggle(cat._id)}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      transition={{ duration: 0.18, type: "spring", stiffness: 380 }}
                      style={{
                        animation: idx < 12 ? `fade-in-up 0.4s ease-out ${idx * 0.03}s backwards` : "none",
                      }}
                      className={`relative cursor-pointer aspect-square rounded-2xl overflow-hidden border-2 transition-all duration-300 flex flex-col justify-between ${
                        isSelected
                          ? "border-[var(--primary-theme)] shadow-md shadow-[var(--primary-theme)]/15"
                          : "border-transparent hover:border-gray-200 dark:hover:border-gray-700"
                      }`}
                    >
                      {/* Image */}
                      <div className="w-full h-[65%] overflow-hidden relative bg-gray-100 dark:bg-gray-800">
                        {imageUrl ? (
                          <img
                            src={imageUrl}
                            alt={cat.name}
                            className="w-full h-full object-cover"
                            onError={(e) => { e.target.style.display = "none"; }}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-2xl">
                            🍽️
                          </div>
                        )}
                        {/* Selected check badge */}
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5">
                            <div className="bg-[var(--primary-theme)] rounded-full w-5 h-5 flex items-center justify-center shadow-md">
                              <Check className="w-3 h-3 text-white" strokeWidth={3} />
                            </div>
                          </div>
                        )}
                        {/* Selected tint overlay */}
                        {isSelected && (
                          <div className="absolute inset-0 bg-[var(--primary-theme)]/10" />
                        )}
                      </div>

                      {/* Category Name */}
                      <div
                        className={`h-[35%] flex items-center justify-center px-1 text-center ${
                          isSelected
                            ? "bg-orange-50 dark:bg-orange-900/20"
                            : "bg-gray-50 dark:bg-gray-800"
                        }`}
                      >
                        <span
                          className={`text-[11px] sm:text-xs font-bold leading-tight ${
                            isSelected
                              ? "text-[var(--primary-theme)] dark:text-orange-400"
                              : "text-gray-700 dark:text-gray-300"
                          }`}
                        >
                          {cat.name}
                        </span>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Save Button */}
        <motion.button
          onClick={handleSave}
          disabled={selectedIds.length < 1 || isSaving}
          whileHover={selectedIds.length >= 1 && !isSaving ? { scale: 1.02 } : {}}
          whileTap={selectedIds.length >= 1 && !isSaving ? { scale: 0.98 } : {}}
          transition={{ duration: 0.15 }}
          className={`w-full py-4 px-6 rounded-2xl text-sm font-bold text-white shadow-sm transition-all duration-300 flex items-center justify-center gap-2 ${
            selectedIds.length >= 1 && !isSaving
              ? "bg-[var(--primary-theme)] hover:bg-[var(--primary-theme)] shadow-[var(--primary-theme)]/25"
              : "bg-gray-300 dark:bg-gray-700 cursor-not-allowed shadow-none text-gray-400 dark:text-gray-500"
          }`}
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Saving...
            </>
          ) : isEditMode ? (
            <>
              {selectedIds.length > 0
                ? `Update ${selectedIds.length} preference${selectedIds.length !== 1 ? "s" : ""}`
                : "Select at least 1"}
            </>
          ) : (
            <>
              {selectedIds.length > 0
                ? `Save ${selectedIds.length} preference${selectedIds.length !== 1 ? "s" : ""}`
                : "Select at least 1"}
            </>
          )}
        </motion.button>

      </div>
    </AnimatedPage>
  );
}
