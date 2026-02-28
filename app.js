require('dotenv').config()
const cors = require('cors')
const express = require('express')
const app = express()
const port = process.env.PORT || 8080;
const supabase = require('./services/supabase.js')
const bcrypt = require("bcrypt");
const validator = require("validator");
const BUCKETNAME = process.env.SUPABASE_BUCKET;
const path = require('node:path');
const multer = require("multer");
const crypto = require('node:crypto');
app.use(cors());
app.use(express.json());


app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.get('/test', async(req,res) =>{
  const {data} = await supabase.from('Test').select("*");
  res.send(data);
})

app.post('/test/create', async(req,res) =>{
  const {text} = req.body;
  console.log(req.body)
  if(!text) return res.status(500).json({success: false});
  
  const {data,error} = await supabase.from('Test').insert({"Name": text}).select()
  if(error) return res.status(500).json(error)
    console.log(data)
  res.send(data)
})

app.post('/register', async (req, res) => {
  try {
    let { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "All fields are required"
      });
    }

    email = email.trim();

    if (!validator.isEmail(email)) {
      return res.status(400).json({
        message: "Invalid email format"
      });
    }

    
    name = validator.escape(name);

    
    const { data: existingUser, error: findError } = await supabase
      .from('Users')
      .select("*")
      .or(`user_name.eq.${name},user_email.eq.${email}`);

    if (findError) {
      return res.status(500).json(findError);
    }

    if (existingUser.length > 0) {
      return res.status(400).json({
        message: "User with this email or username already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const { error } = await supabase
      .from('Users')
      .insert([
        {
          user_name: name,
          user_email: email,
          user_password: hashedPassword
        }
      ]);

    if (error) {
      return res.status(400).json(error);
    }

    res.json({ message: "User created successfully" });

  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

app.post("/login", async (req, res) =>{
  try{

    const {email, password} = req.body

    if (!email || !password) {
      return res.status(400).json({
        message: "Some fields are empty"
      });
    }

    const {data: user, error} = await supabase
    .from("Users")
    .select("*")
    .eq("user_email", email)
    .single();

    if(error || !user){
      return res.status(400).json({
        message: "Email or password are incorrect"
      });
    }

    const isMatch = await bcrypt.compare(password, user.user_password);

    if (!isMatch) {
      return res.status(400).json({
        message: "Email or password are incorrect"
      });
    }


    res.json({
      message: "Login successfull",
      success: true,
      userName: user.user_name
    })

  } catch (er){
    res.status(500).json({error: "Server error"})
  }
})

const upload = multer({
  storage: multer.memoryStorage(), 
  limits: { fileSize: 300 * 1024 * 1024 },     
});

function makeObjectPath(originalName) {
  const ext = path.extname(originalName || "");
  const id = crypto.randomBytes(16).toString("hex");
  const yyyy = new Date().getFullYear();
  return `${yyyy}/${id}-${safeName(path.basename(originalName, ext))}${ext}`;
}

function safeName(name = "file") {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, "_");
}

app.post("/upload", upload.single('file'), async(req, res) =>{
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file. Field name must be "file".' });
    }
    const {name, description, year, period, category, notAllowed} = req.body;
    const objectPath = makeObjectPath(req.file.originalname);
    const notAllowedArr = notAllowed
    ? notAllowed.trim().split(/[,\s]+/).filter(Boolean)
    : [];
    if (!name || !description || !year || !period || !category) {
      return res.status(400).json({
        message: "Some fields are empty"
      });
    }

    const { data, error } = await supabase.storage
      .from(BUCKETNAME)
      .upload(objectPath, req.file.buffer, {
        contentType: req.file.mimetype || "application/octet-stream",
        upsert: false,
      });

    if (error) return res.status(500).json({ error: error.message });

    
    const { data: pub } = supabase.storage.from(BUCKETNAME).getPublicUrl(objectPath);

    const {data: insertedFile, error: errorFiles } = await supabase
      .from('UploadedFiles')
      .insert([
        {
          url: pub.publicUrl,
          name: name,
          description: description,
          year: year,
          period: period,
          category: category 
        }
      ])
      .select()
      .single();

    if (errorFiles) {
      return res.status(400).json(errorFiles);
    }


    for(let i = 0; i < notAllowedArr.length; i++){
      const {error: errorNotAllowed} = await supabase
      .from('notAvailableUsers')
      .insert([
        {
          file_id: insertedFile.id,
          user_name: notAllowedArr[i]
        }
      ])

      if (errorNotAllowed) {
        return res.status(400).json(errorNotAllowed);
      }
    }


    //res.json({ message: "User created successfully" });
    return res.status(201).json({
      ok: true,
      bucket: BUCKETNAME,
      path: data.path,
      publicUrl: pub?.publicUrl ?? null,
      mimeType: req.file.mimetype,
      size: req.file.size,
      originalName: req.file.originalname,
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Upload failed" });
  }
})

app.get("/project", async (req, res) => {
  try {
    const { user_name } = req.query;

    if (!user_name) {
      return res.status(400).json({ message: "User name required" });
    }

    const { data: restricted, error: err1 } = await supabase
      .from("notAvailableUsers")
      .select("file_id")
      .eq("user_name", user_name);

    if (err1) {
      return res.status(500).json(err1);
    }

    const restrictedIds = restricted.map(r => r.file_id);

    let query = supabase.from("UploadedFiles").select("*");

    if (restrictedIds.length > 0) {
      query = query.not("id", "in", `(${restrictedIds.join(",")})`);
    }

    const { data: files, error: err2 } = await query;

    if (err2) {
      return res.status(500).json(err2);
    }

    res.json(files);

  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});