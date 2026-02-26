require('dotenv').config()
module.exports = {supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_KEY,
}}