import React from "react"

export default function Loader() {
  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] pointer-events-none">
      <div className="h-1 w-full bg-[var(--primary-theme,#49AB14)] animate-pulse shadow-sm" />
    </div>
  )
}
