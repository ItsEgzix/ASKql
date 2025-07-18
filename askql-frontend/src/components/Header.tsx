import { DatabaseZap } from "lucide-react";
import React from "react";

const Header: React.FC = () => {
  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto py-4 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <DatabaseZap className="h-8 w-8 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-800">ASKql</h1>
        </div>
      </div>
    </header>
  );
};

export default Header;
