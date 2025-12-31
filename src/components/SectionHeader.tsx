import React from 'react';

export const SectionHeader: React.FC = () => {
  return (
    <header className="w-full py-8 text-center flex flex-col items-center justify-center space-y-2">
      <h1 className="mb-4 font-brand italic tracking-wide text-3xl text-cresc-800">
        cresc.nail
      </h1>
      <div className="w-12 h-0.5 bg-cresc-400 opacity-50"></div>
    </header>
  );
};