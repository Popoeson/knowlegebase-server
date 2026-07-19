const { isValidImage, isValidExcel } = require("../utils/fileSignatures");

// Runs AFTER multer (upload.single / excelUpload.single) so req.file.buffer
// is actually populated — multer's own fileFilter fires before the file
// content is available, so it can only check the (spoofable) header.
const verifyImageSignature = (req, res, next) => {
    if (!req.file) return next();

    if (!isValidImage(req.file.buffer, req.file.mimetype)) {
        return res.status(400).json({
            message: "File content does not match a valid image format."
        });
    }
    next();
};

const verifyExcelSignature = (req, res, next) => {
    if (!req.file) return next();

    if (!isValidExcel(req.file.buffer, req.file.mimetype)) {
        return res.status(400).json({
            message: "File content does not match a valid Excel/CSV format."
        });
    }
    next();
};

module.exports = { verifyImageSignature, verifyExcelSignature };