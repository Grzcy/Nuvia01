// Shared avatar utilities (ES module)
// Centralized helpers for Cloudinary URLs and robust avatar rendering

export const cloudinaryConfig = {
  cloudName: "dxld01rcp",
  uploadPreset: "Storage_preset"
};

/**
 * Build a Cloudinary URL from a full URL or publicId, inserting transformations.
 * Falls back to returning the original URL if not Cloudinary.
 */
export function getCloudinaryImageUrl(urlOrPublicId, transformations = "w_auto,f_auto,q_auto") {
  if (!urlOrPublicId) return null;
  if (urlOrPublicId.startsWith("http://") || urlOrPublicId.startsWith("https://")) {
    if (urlOrPublicId.includes("res.cloudinary.com")) {
      const parts = urlOrPublicId.split("/upload/");
      if (parts.length === 2) {
        return `${parts[0]}/upload/${transformations}/${parts[1]}`;
      }
      // Some URLs may contain /image/upload or /video/upload; the above split still works
    }
    return urlOrPublicId;
  }
  return `https://res.cloudinary.com/${cloudinaryConfig.cloudName}/image/upload/${transformations}/${urlOrPublicId}`;
}

/**
 * Display a profile image or fallback icon/placeholder.
 * - Shows img when profilePicId exists; otherwise shows iconElement if provided.
 * - Adds lazy-loading and async decoding.
 */
export function displayProfilePicture(imgElement, iconElement, profilePicId, usernameInitial = "U", transformations = "w_70,h_70,c_fill,g_face,r_max") {
  if (!imgElement) return;
  const initial = (usernameInitial || "U").toString().charAt(0).toUpperCase();
  const showPlaceholder = () => {
    if (imgElement) {
      imgElement.onerror = null;
      imgElement.loading = "lazy";
      imgElement.decoding = "async";
      imgElement.src = `https://placehold.co/40x40/CCCCCC/000000?text=${encodeURIComponent(initial)}`;
      imgElement.style.display = "block";
    }
    if (iconElement) {
      iconElement.style.display = "none"; // keep consistent UI with image placeholder
    }
  };

  if (profilePicId) {
    const imageUrl = getCloudinaryImageUrl(profilePicId, transformations);
    if (!imageUrl) return showPlaceholder();
    imgElement.loading = "lazy";
    imgElement.decoding = "async";
    imgElement.src = imageUrl;
    imgElement.style.display = "block";
    if (iconElement) iconElement.style.display = "none";
    imgElement.onerror = showPlaceholder;
  } else {
    if (iconElement) {
      imgElement.src = "";
      imgElement.style.display = "none";
      iconElement.style.display = "block";
    } else {
      showPlaceholder();
    }
  }
}

/** Convenience to build initial-based placeholder */
export function buildInitialPlaceholder(initial = "U", size = 40, bg = "CCCCCC", fg = "000000") {
  const letter = (initial || "U").toString().charAt(0).toUpperCase();
  return `https://placehold.co/${size}x${size}/${bg}/${fg}?text=${encodeURIComponent(letter)}`;
}
