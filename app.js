require('dotenv').config()
const cors = require('cors')
const express = require('express')
const app = express()
const port = 8080
const supabase = require('./services/supabase.js')
const bcrypt = require("bcrypt");
const validator = require("validator");
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

    console.log(user);
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


app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})