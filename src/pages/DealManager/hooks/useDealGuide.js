// // useDealGuide.js
// // Wraps an action so it only runs after the user has read and acknowledged
// // the Deal Manager guide popup. Logic unchanged from the original file —
// // pulled out because it's a self-contained piece of UI state that has
// // nothing to do with deal data itself.

// import { useRef, useState, useCallback } from 'react';

// export const useDealGuide = () => {
//   const [showGuideModal, setShowGuideModal] = useState(false);
//   const guideActionRef = useRef(null);

//   const runWithGuide = useCallback((actionFn) => {
//     guideActionRef.current = actionFn;
//     setShowGuideModal(true);
//   }, []);

//   const handleGuideConfirm = useCallback(() => {
//     setShowGuideModal(false);
//     const action = guideActionRef.current;
//     guideActionRef.current = null;
//     if (action) action();
//   }, []);

//   const handleGuideCancel = useCallback(() => {
//     setShowGuideModal(false);
//     guideActionRef.current = null;
//   }, []);

//   return { showGuideModal, runWithGuide, handleGuideConfirm, handleGuideCancel };
// };
