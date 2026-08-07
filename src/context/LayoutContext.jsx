import React, { createContext, useContext, useState } from "react";

const LayoutContext = createContext();

export const LayoutProvider = ({ children }) => {
  const [hideBottomNav, setHideBottomNav] = useState(false);
  const [hideHeader, setHideHeader] = useState(false);

  return (
    <LayoutContext.Provider
      value={{
        hideBottomNav,
        setHideBottomNav,
        hideHeader,
        setHideHeader,
      }}
    >
      {children}
    </LayoutContext.Provider>
  );
};

export const useLayout = () => useContext(LayoutContext);