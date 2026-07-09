const https = require("https");

// Registration fee is set here (env var), never trusted from the client.
const REGISTRATION_FEE_USD = Number(process.env.REGISTRATION_FEE_USD) || 0.5;

// ── GET LIVE USD → NGN EXCHANGE RATE ──
// Falls back to 1600 if the rate API is unreachable, matching the
// frontend's existing fallback so displayed and charged prices stay close.
const getExchangeRate = () => {
    return new Promise((resolve) => {
        https.get("https://open.er-api.com/v6/latest/USD", (res) => {
            let data = "";
            res.on("data", (chunk) => { data += chunk; });
            res.on("end", () => {
                try {
                    const parsed = JSON.parse(data);
                    const rate = parsed.rates && parsed.rates.NGN;
                    resolve(rate || 1600);
                } catch (e) {
                    resolve(1600);
                }
            });
        }).on("error", () => resolve(1600));
    });
};

// ── REGISTRATION FEE IN NGN (server-computed) ──
const getRegistrationAmountNGN = async () => {
    const rate = await getExchangeRate();
    return Math.round(REGISTRATION_FEE_USD * rate);
};

// ── COURSE PRICE IN NGN (server-computed, from stored USD price) ──
const getCourseAmountNGN = async (priceUSD) => {
    const rate = await getExchangeRate();
    return Math.round(priceUSD * rate);
};

module.exports = {
    REGISTRATION_FEE_USD,
    getExchangeRate,
    getRegistrationAmountNGN,
    getCourseAmountNGN
};
