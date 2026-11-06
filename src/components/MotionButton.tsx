
import React from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';
import { cn } from '../utils/cn';

interface MotionButtonProps extends HTMLMotionProps<'button'> {
  className?: string;
  children: React.ReactNode;
}

export const MotionButton: React.FC<MotionButtonProps> = ({ 
  className, 
  children, 
  ...props 
}) => {
  return (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "inline-flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:pointer-events-none disabled:opacity-50",
        className
      )}
      {...props}
    >
      {children}
    </motion.button>
  );
};
