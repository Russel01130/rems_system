/* Shared image preparation for inventory and pet registration. Resizing before upload keeps encoded images small enough for JSON storage. */

// Decodes a supported image, bounds it to 480 pixels per edge and encodes a compact photo for storage.
async function prepareRecordPhoto(file) {
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 10 * 1024 * 1024) {
        throw new Error('Choose a JPG, PNG, WebP, or GIF up to 10 MB.');
    }
    const picture = await createImageBitmap(file);
    try {
        const scale = Math.min(1, 480 / Math.max(picture.width, picture.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(picture.width * scale));
        canvas.height = Math.max(1, Math.round(picture.height * scale));
        canvas.getContext('2d').drawImage(picture, 0, 0, canvas.width, canvas.height);
        return canvas.toDataURL('image/webp', 0.82);
    } finally {
        picture.close();
    }
}
