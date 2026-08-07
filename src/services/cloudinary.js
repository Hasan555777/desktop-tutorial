// src/services/cloudinary.js
export const uploadToCloudinary = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", "workhub_preset");

  try {
    const response = await fetch(
      "https://api.cloudinary.com/v1_1/drwex6tmf/image/upload",
      { method: "POST", body: formData }
    );
    const data = await response.json();
    return data.secure_url;
  } catch (error) {
    console.error("Cloudinary Upload Error:", error);
    return null;
  }
};