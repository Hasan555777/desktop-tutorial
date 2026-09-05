import { useEffect } from "react";
import { useLayout } from "../context/LayoutContext"; // ⚠️ Navbar-এর মতো একই path ব্যবহার করো

const useHideBottomNav = () => {
  const { setHideBottomNav } = useLayout();

  useEffect(() => {
    console.log("Hook Mounted");

    setHideBottomNav(true);
    console.log("Set TRUE");

    return () => {
      console.log("Set FALSE");
      setHideBottomNav(false);
    };
  }, [setHideBottomNav]);
};

export default useHideBottomNav;



