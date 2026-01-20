'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface CostProLogoProps {
  size?: number;
  className?: string;
  animated?: boolean;
}

const CostProLogo = ({ size = 40, className, animated = false }: CostProLogoProps) => {
  const svgContent = (
    <svg
      width={size * 2.5}
      height={size}
      viewBox="0 0 100 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn(className)}
    >
      <text
        x="50%"
        y="50%"
        dy=".3em"
        textAnchor="middle"
        fontFamily="Geist, sans-serif"
        fontSize="24"
        fontWeight="bold"
        fill="currentColor"
        className="text-primary"
      >
        <tspan>COSTPRO</tspan>
      </text>
    </svg>
  );

  if (animated) {
    return (
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5 }}
      >
        {svgContent}
      </motion.div>
    );
  }

  return svgContent;
};

export default CostProLogo;
