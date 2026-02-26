const config = require("../config/index.js");
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(config.supabase.url, config.supabase.key);
module.exports = supabase;