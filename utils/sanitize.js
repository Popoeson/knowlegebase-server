// Converts < and > to HTML entities so stored question/option text can
// never be interpreted as markup if a frontend page ever renders it with
// innerHTML instead of textContent. Applied at the point of saving, so
// every write path (manual add/edit, bulk upload, AI-approved) is covered
// once instead of needing to trust every future frontend render site.
const stripHtml = (str) => {
    if (typeof str !== "string") return str;
    return str.replace(/</g, "&lt;").replace(/>/g, "&gt;");
};

module.exports = { stripHtml };