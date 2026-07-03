import React, { useEffect } from "react"
import { motion } from "framer-motion"
import LogoImage from "@/assets/Logo.webp"

// Import the generated funky dark transparent PNG icons (perfectly segmented)
import icon0 from '@/assets/funky/icon_0.png'
import icon1 from '@/assets/funky/icon_1.png'
import icon2 from '@/assets/funky/icon_2.png'
import icon3 from '@/assets/funky/icon_3.png'
import icon4 from '@/assets/funky/icon_4.png'
import icon5 from '@/assets/funky/icon_5.png'
import icon6 from '@/assets/funky/icon_6.png'
import icon7 from '@/assets/funky/icon_7.png'
import icon8 from '@/assets/funky/icon_8.png'
import icon9 from '@/assets/funky/icon_9.png'

export default function SplashScreen({ onComplete }) {

  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete()
    }, 4000)

    return () => clearTimeout(timer)
  }, [onComplete])

  // Custom float configurations for standard icons
  const floatTransition = (delay = 0) => ({
    y: {
      duration: 2.8,
      repeat: Infinity,
      repeatType: "reverse",
      ease: "easeInOut",
      delay,
    },
    rotate: {
      duration: 4.2,
      repeat: Infinity,
      repeatType: "reverse",
      ease: "easeInOut",
      delay,
    }
  })

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      style={{ backgroundColor: "#FDF4EC" }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden select-none"
    >
      {/* Outer corner route paths only - staying far away from the center logo background */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.05] stroke-[#334155] fill-none" strokeWidth="2.5" strokeDasharray="6 6">
        <path d="M -20 80 C 80 40, 120 180, 240 100" />
        <path d="M 960 100 C 1080 180, 1120 40, 1220 80" />
      </svg>

      {/* --- LEFT SIDE: FUNKY DARK PNGs (Full Opacity: 1.0, Shifted to outer edge, Responsive Large Scale) --- */}

      {/* Icon 0 */}
      <motion.div
        initial={{ opacity: 0, y: -150, x: 20 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        transition={{ delay: 0.5, duration: 0.9, type: "spring", stiffness: 90 }}
        className="absolute w-16 h-16 md:w-24 md:h-24 pointer-events-none"
        style={{ left: "5%", top: "18%" }}
      >
        <motion.div
          animate={{ y: [-6, 6], rotate: [-2, 2] }}
          transition={floatTransition(0)}
          className="w-full h-full"
        >
          <img src={icon0} alt="Icon 0" className="w-full h-full object-contain filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.18)]" />
        </motion.div>
      </motion.div>

      {/* Icon 1 */}
      <motion.div
        initial={{ opacity: 0, x: -150, rotate: -20 }}
        animate={{ opacity: 1, x: 0, rotate: 0 }}
        transition={{ delay: 0.7, duration: 1.0, type: "spring", stiffness: 70 }}
        className="absolute w-16 h-16 md:w-24 md:h-24 pointer-events-none"
        style={{ left: "12%", top: "34%" }}
      >
        <motion.div
          animate={{ y: [6, -6], rotate: [2, -2] }}
          transition={floatTransition(0.3)}
          className="w-full h-full"
        >
          <img src={icon1} alt="Icon 1" className="w-full h-full object-contain filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.18)]" />
        </motion.div>
      </motion.div>

      {/* Icon 2 */}
      <motion.div
        initial={{ opacity: 0, y: 150, scale: 0.7 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ delay: 0.6, duration: 0.8, type: "spring" }}
        className="absolute w-16 h-16 md:w-24 md:h-24 pointer-events-none"
        style={{ left: "4%", top: "52%" }}
      >
        <motion.div
          animate={{ y: [-5, 5], rotate: [-1, 3] }}
          transition={floatTransition(0.15)}
          className="w-full h-full"
        >
          <img src={icon2} alt="Icon 2" className="w-full h-full object-contain filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.18)]" />
        </motion.div>
      </motion.div>

      {/* Icon 3 */}
      <motion.div
        initial={{ opacity: 0, x: -120, y: 80 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ delay: 0.9, duration: 1.0, type: "spring" }}
        className="absolute w-16 h-16 md:w-24 md:h-24 pointer-events-none"
        style={{ left: "13%", top: "70%" }}
      >
        <motion.div
          animate={{ y: [4, -8], rotate: [-3, 3] }}
          transition={floatTransition(0.4)}
          className="w-full h-full"
        >
          <img src={icon3} alt="Icon 3" className="w-full h-full object-contain filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.18)]" />
        </motion.div>
      </motion.div>

      {/* Icon 4 */}
      <motion.div
        initial={{ opacity: 0, y: 120, x: -50 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        transition={{ delay: 1.1, duration: 0.9, type: "spring" }}
        className="absolute w-16 h-16 md:w-24 md:h-24 pointer-events-none"
        style={{ left: "5%", top: "84%" }}
      >
        <motion.div
          animate={{ y: [-6, 6], rotate: [2, -2] }}
          transition={floatTransition(0.65)}
          className="w-full h-full"
        >
          <img src={icon4} alt="Icon 4" className="w-full h-full object-contain filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.18)]" />
        </motion.div>
      </motion.div>


      {/* --- RIGHT SIDE: FUNKY DARK PNGs (Full Opacity: 1.0, Shifted to outer edge, Responsive Large Scale) --- */}

      {/* Icon 5 */}
      <motion.div
        initial={{ opacity: 0, x: 150, rotate: 15 }}
        animate={{ opacity: 1, x: 0, rotate: 0 }}
        transition={{ delay: 0.55, duration: 0.9, type: "spring", stiffness: 85 }}
        className="absolute w-16 h-16 md:w-24 md:h-24 pointer-events-none"
        style={{ right: "5%", top: "16%" }}
      >
        <motion.div
          animate={{ y: [6, -6], rotate: [2, -2] }}
          transition={floatTransition(0.1)}
          className="w-full h-full"
        >
          <img src={icon5} alt="Icon 5" className="w-full h-full object-contain filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.18)]" />
        </motion.div>
      </motion.div>

      {/* Icon 6 */}
      <motion.div
        initial={{ opacity: 0, y: -100, x: 80 }}
        animate={{ opacity: 1, y: 0, x: 0 }}
        transition={{ delay: 0.75, duration: 0.8, type: "spring" }}
        className="absolute w-16 h-16 md:w-24 md:h-24 pointer-events-none"
        style={{ right: "12%", top: "32%" }}
      >
        <motion.div
          animate={{ y: [-5, 7], rotate: [-2, 2] }}
          transition={floatTransition(0.25)}
          className="w-full h-full"
        >
          <img src={icon6} alt="Icon 6" className="w-full h-full object-contain filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.18)]" />
        </motion.div>
      </motion.div>

      {/* Icon 7 */}
      <motion.div
        initial={{ opacity: 0, x: 150, scale: 0.6 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={{ delay: 0.65, duration: 1.1, type: "spring" }}
        className="absolute w-16 h-16 md:w-24 md:h-24 pointer-events-none"
        style={{ right: "4%", top: "50%" }}
      >
        <motion.div
          animate={{ y: [8, -4], rotate: [-3, 3] }}
          transition={floatTransition(0.5)}
          className="w-full h-full"
        >
          <img src={icon7} alt="Icon 7" className="w-full h-full object-contain filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.18)]" />
        </motion.div>
      </motion.div>

      {/* Icon 8 */}
      <motion.div
        initial={{ opacity: 0, x: 120, y: 100 }}
        animate={{ opacity: 1, x: 0, y: 0 }}
        transition={{ delay: 0.95, duration: 1.0, type: "spring" }}
        className="absolute w-16 h-16 md:w-24 md:h-24 pointer-events-none"
        style={{ right: "12%", top: "68%" }}
      >
        <motion.div
          animate={{ y: [-7, 5], rotate: [2, -2] }}
          transition={floatTransition(0.35)}
          className="w-full h-full"
        >
          <img src={icon8} alt="Icon 8" className="w-full h-full object-contain filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.18)]" />
        </motion.div>
      </motion.div>

      {/* Icon 9 */}
      <motion.div
        initial={{ opacity: 0, y: 150, rotate: -10 }}
        animate={{ opacity: 1, y: 0, rotate: 0 }}
        transition={{ delay: 1.15, duration: 0.85, type: "spring" }}
        className="absolute w-16 h-16 md:w-24 md:h-24 pointer-events-none"
        style={{ right: "5%", top: "82%" }}
      >
        <motion.div
          animate={{ y: [5, -5], rotate: [-2, 2] }}
          transition={floatTransition(0.6)}
          className="w-full h-full"
        >
          <img src={icon9} alt="Icon 9" className="w-full h-full object-contain filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.18)]" />
        </motion.div>
      </motion.div>


      {/* --- MAIN LOGO & ZOOM ANIMATION --- */}

      <div className="relative flex items-center justify-center z-10">
        {/* Logo Container with elastic zoom, bounce, and then zoom transition forward */}
        <motion.div
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{
            scale: [0.7, 1.15, 1.0],
            opacity: [0, 1, 1],
          }}
          transition={{
            delay: 1.3, // Step 3 starts at ~1.3s - 1.5s
            duration: 1.0,
            times: [0, 0.7, 1.0],
            ease: [0.34, 1.56, 0.64, 1] // Custom elastic ease-out
          }}
        >
          {/* Transition Zoom: logo scales 1.0 -> 3.8 with motion blur and smooth acceleration */}
          <motion.div
            animate={{
              scale: [1, 1, 3.8],
              filter: ["blur(0px)", "blur(0px)", "blur(12px)"],
              opacity: [1, 1, 0]
            }}
            transition={{
              times: [0, 0.8, 1],
              duration: 4.0,
              ease: "easeInOut"
            }}
            className="flex flex-col items-center justify-center p-6"
          >
            <img
              src={LogoImage}
              alt="Superfast Logo"
              className="w-64 h-64 md:w-80 md:h-80 object-contain drop-shadow-[0_10px_25px_rgba(198,40,40,0.15)]"
            />
          </motion.div>
        </motion.div>
      </div>

    </motion.div>
  )
}
