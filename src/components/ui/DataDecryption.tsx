// src/components/ui/DataDecryption.tsx
'use client';

import { motion } from 'framer-motion';

const DataDecryption = () => {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <motion.div
        className="w-24 h-24 border-4 border-cyan-400 border-t-transparent rounded-full"
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
      />
      <motion.p
        className="mt-4 text-lg text-cyan-400 font-mono"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
      >
        DECRYPTING DATA...
      </motion.p>
    </div>
  );
};

export default DataDecryption;
