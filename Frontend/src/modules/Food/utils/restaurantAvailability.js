const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
]

const normalizeDay = (value) => {
  if (!value || typeof value !== "string") return null
  const trimmed = value.trim().toLowerCase()
  const match = DAY_NAMES.find((day) => day.toLowerCase() === trimmed)
  if (match) return match

  const abbreviatedMatch = DAY_NAMES.find((day) =>
    day.toLowerCase().startsWith(trimmed.slice(0, 3))
  )
  return abbreviatedMatch || null
}

const parseTimeToMinutes = (timeValue) => {
  if (!timeValue || typeof timeValue !== "string") return null
  const raw = timeValue.trim()
  if (!raw) return null

  const normalized = raw.toLowerCase()
  const meridiemMatch = normalized.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap]m)$/)
  if (meridiemMatch) {
    let hour = Number(meridiemMatch[1])
    const minute = Number(meridiemMatch[2])
    const period = meridiemMatch[3]

    if (Number.isNaN(hour) || Number.isNaN(minute) || minute < 0 || minute > 59) return null

    if (period === "pm" && hour < 12) hour += 12
    if (period === "am" && hour === 12) hour = 0
    if (hour < 0 || hour > 23) return null
    return hour * 60 + minute
  }

  const twentyFourHourMatch = normalized.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/)
  if (!twentyFourHourMatch) return null

  const hour = Number(twentyFourHourMatch[1])
  const minute = Number(twentyFourHourMatch[2])
  if (Number.isNaN(hour) || Number.isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null
  }

  return hour * 60 + minute
}

const getTodayTiming = (restaurant, dayName) => {
  let outletTimings = restaurant?.outletTimings
  if (outletTimings && outletTimings.outletTimings && typeof outletTimings.outletTimings === "object") {
    outletTimings = outletTimings.outletTimings
  }

  const outletTimingsArray = outletTimings?.timings || (Array.isArray(outletTimings) ? outletTimings : null)
  if (Array.isArray(outletTimingsArray)) {
    const exact = outletTimingsArray.find((entry) => normalizeDay(entry?.day) === dayName)
    if (exact) return exact
  }

  if (outletTimings && typeof outletTimings === "object" && !Array.isArray(outletTimings)) {
    const direct = outletTimings[dayName] ||
      Object.entries(outletTimings).find(([key]) => normalizeDay(key) === dayName)?.[1]
    if (direct && typeof direct === "object") return direct
  }

  return null
}

const isWithinTimeWindow = (nowMinutes, openingMinutes, closingMinutes) => {
  if (openingMinutes === null || closingMinutes === null) return true
  if (openingMinutes === closingMinutes) return true

  if (closingMinutes > openingMinutes) {
    return nowMinutes >= openingMinutes && nowMinutes <= closingMinutes
  }

  return nowMinutes >= openingMinutes || nowMinutes <= closingMinutes
}

const getMinutesUntilClosing = (nowMinutes, openingMinutes, closingMinutes) => {
  if (openingMinutes === null || closingMinutes === null) return null
  if (!isWithinTimeWindow(nowMinutes, openingMinutes, closingMinutes)) return null

  if (closingMinutes > openingMinutes) {
    return closingMinutes - nowMinutes
  }

  if (nowMinutes <= closingMinutes) {
    return closingMinutes - nowMinutes
  }

  return (24 * 60 - nowMinutes) + closingMinutes
}

const formatTimeLabel = (timeValue) => {
  const totalMinutes = parseTimeToMinutes(timeValue)
  if (totalMinutes === null) return timeValue || null

  const hours24 = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const period = hours24 >= 12 ? "PM" : "AM"
  const hours12 = hours24 % 12 || 12

  return `${hours12}:${String(minutes).padStart(2, "0")} ${period}`
}

const formatClosingCountdown = (minutesUntilClose, closingTime) => {
  if (minutesUntilClose === null || minutesUntilClose === undefined) return null

  if (minutesUntilClose <= 0) {
    const closingLabel = formatTimeLabel(closingTime)
    return closingLabel ? `Closes at ${closingLabel}` : null
  }

  if (minutesUntilClose < 60) {
    return `Closes in ${minutesUntilClose} min`
  }

  const hours = Math.floor(minutesUntilClose / 60)
  const minutes = minutesUntilClose % 60

  if (minutes === 0) {
    return `Closes in ${hours}h`
  }

  return `Closes in ${hours}h ${minutes}m`
}

export const getRestaurantAvailabilityStatus = (restaurant, now = new Date(), options = {}) => {
  if (!restaurant) {
    return {
      isOpen: false,
      isActive: false,
      isAcceptingOrders: false,
      isWithinTimings: false,
      reason: "missing-restaurant",
    }
  }

  const ignoreOperationalStatus = options?.ignoreOperationalStatus === true
  const isActive = restaurant.isActive !== false
  const manualOffline = restaurant.manualOffline === true
  const isAcceptingOrders = restaurant.isAcceptingOrders !== false

  if (!ignoreOperationalStatus && !isActive) {
    return {
      isOpen: false,
      isActive,
      isAcceptingOrders,
      isWithinTimings: false,
      reason: "inactive",
    }
  }

  // Only force offline if vendor manually toggled manualOffline: true
  if (!ignoreOperationalStatus && manualOffline) {
    return {
      isOpen: false,
      isActive,
      isAcceptingOrders: false,
      isWithinTimings: false,
      reason: "not-accepting-orders",
    }
  }

  const dayName = DAY_NAMES[now.getDay()]
  const todayTiming = getTodayTiming(restaurant, dayName)
  const nowMinutes = now.getHours() * 60 + now.getMinutes()

  // Helper to evaluate if the given timing object is currently active
  const checkTimingOpen = (timingDoc, isPreviousDay = false) => {
    if (!timingDoc || timingDoc.isOpen === false) return null

    const opt = timingDoc.openingTime || null
    const clt = timingDoc.closingTime || null
    const opMin = parseTimeToMinutes(opt)
    const clMin = parseTimeToMinutes(clt)

    if (opMin === null || clMin === null) return null

    const isOvernight = clMin < opMin

    // If we're checking the previous day, we only care if it spans past midnight
    if (isPreviousDay && !isOvernight) return null

    let isWithin = false
    if (isOvernight) {
      if (isPreviousDay) {
        // Since we are checking yesterday's slot today, we are in the next day (00:00 to clMin)
        isWithin = nowMinutes <= clMin
      } else {
        isWithin = nowMinutes >= opMin || nowMinutes <= clMin
      }
    } else {
      isWithin = nowMinutes >= opMin && nowMinutes <= clMin
    }

    if (isWithin) {
      const minutesUntilClose = isOvernight
        ? (isPreviousDay
            ? clMin - nowMinutes
            : (nowMinutes <= clMin ? clMin - nowMinutes : (24 * 60 - nowMinutes) + clMin))
        : clMin - nowMinutes

      return {
        openingTime: opt,
        closingTime: clt,
        minutesUntilClose,
        reason: isAcceptingOrders ? "open" : "open-by-timings"
      }
    }

    return null
  }

  let activeTiming = null

  // 1. Check if today's timing is open
  if (todayTiming) {
    activeTiming = checkTimingOpen(todayTiming, false)
  }

  // 2. If not open by today's timing, check if yesterday's timing was overnight and is still open
  if (!activeTiming) {
    const prevDayName = DAY_NAMES[(now.getDay() + 6) % 7]
    const prevTiming = getTodayTiming(restaurant, prevDayName)
    activeTiming = checkTimingOpen(prevTiming, true)
  }

  // If we found a match from specific outlet timings:
  if (activeTiming) {
    return {
      isOpen: true,
      isActive,
      isAcceptingOrders,
      isWithinTimings: true,
      openingTime: activeTiming.openingTime,
      closingTime: activeTiming.closingTime,
      minutesUntilClose: activeTiming.minutesUntilClose,
      closingCountdownLabel: formatClosingCountdown(activeTiming.minutesUntilClose, activeTiming.closingTime),
      reason: activeTiming.reason,
    }
  }

  // If today has explicit timing but we are not within it (and not in yesterday's overflow), then it's closed
  if (todayTiming) {
    const opt = todayTiming.openingTime
    const clt = todayTiming.closingTime
    return {
      isOpen: false,
      isActive,
      isAcceptingOrders,
      isWithinTimings: false,
      openingTime: opt,
      closingTime: clt,
      minutesUntilClose: null,
      closingCountdownLabel: null,
      reason: todayTiming.isOpen === false ? "day-closed" : "outside-hours",
    }
  }

  // 3. Fallback: No specific timing configured for today (Legacy openDays / general fields)
  const openDays = Array.isArray(restaurant.openDays) ? restaurant.openDays : []
  if (openDays.length > 0) {
    const normalizedOpenDays = new Set(openDays.map((day) => normalizeDay(day)).filter(Boolean))
    if (normalizedOpenDays.size > 0 && !normalizedOpenDays.has(dayName)) {
      return {
        isOpen: false,
        isActive,
        isAcceptingOrders,
        isWithinTimings: false,
        reason: "closed-day",
      }
    }
  }

  const openingTime =
    restaurant?.deliveryTimings?.openingTime ||
    restaurant?.openingTime ||
    null
  const closingTime =
    restaurant?.deliveryTimings?.closingTime ||
    restaurant?.closingTime ||
    null

  const openingMinutes = parseTimeToMinutes(openingTime)
  const closingMinutes = parseTimeToMinutes(closingTime)
  const hasExplicitWindow = Boolean(openingTime || closingTime)
  
  // Also check if general timing is overnight and currently active in next-day context
  let isWithinTimings = false
  let minutesUntilClose = null

  if (hasExplicitWindow && openingMinutes !== null && closingMinutes !== null) {
    const isOvernight = closingMinutes < openingMinutes
    
    // Check if within today's window
    if (isOvernight) {
      isWithinTimings = nowMinutes >= openingMinutes || nowMinutes <= closingMinutes
      minutesUntilClose = isWithinTimings
        ? (nowMinutes <= closingMinutes ? closingMinutes - nowMinutes : (24 * 60 - nowMinutes) + closingMinutes)
        : null
    } else {
      isWithinTimings = nowMinutes >= openingMinutes && nowMinutes <= closingMinutes
      minutesUntilClose = isWithinTimings ? closingMinutes - nowMinutes : null
    }
  } else {
    isWithinTimings = true
  }

  return {
    isOpen: isWithinTimings,
    isActive,
    isAcceptingOrders,
    isWithinTimings,
    openingTime,
    closingTime,
    minutesUntilClose,
    closingCountdownLabel: isWithinTimings
      ? formatClosingCountdown(minutesUntilClose, closingTime)
      : null,
    reason: isWithinTimings
      ? (isAcceptingOrders ? "open" : "open-by-timings")
      : (hasExplicitWindow ? "outside-hours" : "no-timings"),
  }
}
