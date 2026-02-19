import React from 'react';
import { motion } from 'framer-motion';

const PageTransition = ({ children, className = "" }) => {
  // Fix hydration mismatch: only check window width after mount
  const [isDesktop, setIsDesktop] = React.useState(false);

  React.useEffect(() => {
    setIsDesktop(window.innerWidth > 768);
    
    // Optional: Update on resize if needed, but for exit animations 
    // a static check on mount is usually sufficient or add a listener.
    const handleResize = () => setIsDesktop(window.innerWidth > 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 15, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={isDesktop ? { opacity: 0, y: -15, scale: 0.98 } : undefined}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={`w-full ${className}`}
    >
      {children}
    </motion.div>
  );
};

export default PageTransition;
