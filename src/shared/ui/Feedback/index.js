// src/shared/ui/Feedback/index.js
//
// ⚠️ এই ফাইলটা আগে থেকেই ভাঙা ছিল — নিচের সবগুলো import
// (core/DesignSystem/..., feedback/Loading/..., navigation/Modal/...,
// display/Skeleton/..., forms/Button/... ইত্যাদি) এমন সব ফাইলের path
// দেখাচ্ছিল যেগুলো এই zip-এ কখনো ছিলই না — সম্ভবত একটা আলাদা/পরিত্যক্ত
// design-system প্ল্যানের অবশিষ্টাংশ।
//
// পুরো কোডবেসে এই index.js ফাইলটা কোথাও import করা হয় না (0 importers) —
// সবাই সরাসরি './FeedbackProvider', './Alert/Alert', './Modal/Modal'
// ইত্যাদি থেকে import করে। তাই এটা নিরাপদে মুছে ফেলা যায়, অথবা এই
// ফোল্ডারের আসল ফাইলগুলো (Alert, BottomSheet, Confirm, FeedbackProvider,
// Loader, Modal, NetworkOverlay, Progress, Prompt, Toast) দিয়ে একটা
// সঠিক barrel বানাতে পারেন — সেটা অনুমান করে আমি নিজে বানাইনি, কারণ
// প্রতিটা ফাইলের exact named export না জেনে ভুল নাম export করলে নতুন
// bug তৈরি হতে পারে।

export {};
