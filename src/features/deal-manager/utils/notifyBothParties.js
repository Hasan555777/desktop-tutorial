// // src/pages/DealManager/utils/notifyBothParties.js

// //
// // IMPROVEMENT: the original file called `notification.notify(...)` twice,
// // back to back, for almost every event — once with `userId: buyerId` and
// // once with `userId: sellerId`, both times repeating the full data payload.
// // That pattern is exactly what caused the two bugs the file's own comments
// // call out ("this used to be ONE notify() call... but no userId", and "this
// // path was missing any notification at all"). Copy-pasting a 10-line block
// // 15 times is how that kind of bug happens.
// //
// // This helper makes "notify both sides of the deal" a single call, so the
// // two-notify pattern can't be forgotten or miscopied again.
// export const notifyBothParties = (notification, event, { buyerId, sellerId }, sharedData) => {
//   notification.notify({
//     event,
//     data: { userId: buyerId, buyerId, sellerId, ...sharedData },
//   });
//   notification.notify({
//     event,
//     data: { userId: sellerId, buyerId, sellerId, ...sharedData },
//   });
// };

// // ✅ ডিফল্ট এক্সপোর্ট যোগ করুন (যদি কেউ ডিফল্ট ইম্পোর্ট করে)
// export default notifyBothParties;