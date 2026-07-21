// Real file-type signatures (magic bytes), checked against the actual
// uploaded content — not the client-supplied Content-Type header, which
// can be forged. A file renamed to .jpg with a spoofed Content-Type would
// pass multer's mimetype-only check but fail this one.

const IMAGE_SIGNATURES = {
    "image/jpeg": [[0xFF, 0xD8, 0xFF]],
    "image/png": [[0x89, 0x50, 0x4E, 0x47]]
};

const EXCEL_SIGNATURES = {
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [[0x50, 0x4B, 0x03, 0x04]], // xlsx is a zip archive
    "application/vnd.ms-excel": [[0xD0, 0xCF, 0x11, 0xE0]] // legacy .xls
    // csv is plain text — no reliable magic bytes to check
};

const matchesSignature = (buffer, signatures) =>
    signatures.some(sig => sig.every((byte, i) => buffer[i] === byte));

const isValidImage = (buffer, mimetype) => {
    if (mimetype === "image/webp") {
        // RIFF container: bytes 0-3 are "RIFF", bytes 8-11 are "WEBP"
        const riff = buffer.slice(0, 4).toString("ascii") === "RIFF";
        const webp = buffer.slice(8, 12).toString("ascii") === "WEBP";
        return riff && webp;
    }
    const sigs = IMAGE_SIGNATURES[mimetype];
    return sigs ? matchesSignature(buffer, sigs) : false;
};

const isValidExcel = (buffer, mimetype) => {
    if (mimetype === "text/csv") return true;
    const sigs = EXCEL_SIGNATURES[mimetype];
    return sigs ? matchesSignature(buffer, sigs) : false;
};

module.exports = { isValidImage, isValidExcel };