var express = require('express');
var router = express.Router();
var crypto = require('crypto');
var nodemailer = require('nodemailer');
var sgTransport = require('nodemailer-sendgrid-transport');
var bcrypt = require('bcrypt');

// const JWT_SECRET=chrissmellslikedurian
const saltingRounds = 10;

const mongoose = require('mongoose');
mongoose.set('useCreateIndex', true);
mongoose.connect('mongodb://localhost:32771/test', { useNewUrlParser: true });

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  roles: [{ type: 'String' }],
  isVerified: { type: Boolean, default: false },
  password: String,
  passwordResetToketn: String,
  passwordResetExpires: Date
});

const User = mongoose.model('User', userSchema);

const tokenSchema = new mongoose.Schema({
  _userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
  token: { type: String, required: true, unique: true },
  createdAt: { type: Date, required: true, default: Date.now, expires: 43200 }
});

const Token = mongoose.model('Token', tokenSchema);



/* GET users listing. */
router.get('/', function (req, res, next) {
  res.send('respond with a resource');
});

router.post('/login', function (req, res) {
  // TODO: validations - check email is valid, is not blank, password is not blank
  User.findOne({ email: req.body.email }, function (err, user) {
    if (!user) return res.status(401).send({ msg: 'The email address ' + req.body.email + ' is not associated with any account. ' })

    // TODO: create isMatch function - needs to encrypt the incoming password with the hashed password from the db
    // if (!isMatch) return res.status(401).send({ msg: 'Invalid email or password' });

    if (!user.isVerified) return res.status(401).send({ type: 'not-verified', msg: 'your account has not been verified' });

    res.send({ token: generateToken(user), user: user.toJSON() });
  })
});

router.post('/signup', function (req, res) {
  User.findOne({ email: req.body.email }, async function (err, user) {
    if (user) 
      return res.status(400).send({ msg: 'This email address is already used with another account' });
    console.log('user: ', user)
    const hashedPassword = await bcrypt.hash(req.body.password, saltingRounds)


    // // if user doesn't exist, create and save user
    // function encryptPassword(password) {
    //   bcrypt.hash(password, saltingRounds, function(err, hash) {
    //     if (err) {
    //       console.log('Error hashing password.');
    //     } else {
    //       console.log('hash inside:', hash)
    //       return hash;
    //     }
    //   });
    // };
    
    console.log('HASHEDPASSWORD: ', hashedPassword)
    user = new User({ name: req.body.name, email: req.body.email, password: hashedPassword });
    user.save(function (err) {
      console.log('user: ', user)
      if (err) { 
        console.log('here')
        return res.status(500).send({ msg: err.message }); }

      // create a verification token for this user
      var token = new Token({ _userId: user._id, token: crypto.randomBytes(16).toString('hex')});
      // save the verification token to the db
      token.save(function (err) {
        console.log('token saved: ', token)
        if (err) { 
          console.log('err in tokeN: ', err)
          return res.status(500).send({ msg: err.message }); }
      })

      var client = nodemailer.createTransport({
        service: 'Gmail',
        auth: {
          user: 'carasmom5',
          pass: 'Trilogy123!'
        }
      });

      var email = { from: 'yourmom@dood.com', to: user.email, subject: 'Account Verification Token', text: 'Hello,\n\n' + 'Please verify your account by clicking the link: \nhttp:\/\/' + req.headers.host + '\/users/confirmation\/' + token.token + '.\n' };
      console.log('yo yo')
      client.sendMail(email, function (err, info) {
        if (err) { return res.status(500).send({ msg: err.message }); }
        return res.status(200).send('A verification email has been sent to ' + user.email + '.');
      });
    });
  });
});

router.get('/confirmation/:token', function (req, res) {
  // find a matching token
  Token.findOne({ token: req.params.token }, function (err, token) {
    if (!token) 
      return res.status(400).send({ type: 'not-verified', msg: 'We were unable to find a valid token. Your token may have expired. Tough luck.' });
    // if token exists, find matching user
    console.log('token: ', token.email)
    User.findOne({ _id: token._userId }, function (err, user) {
      if (!user)
        return res.status(400).send({ msg: 'We were unable to find a user for this token.' });
      if (user.isVerified)
        return res.status(400).send({ type: 'already-verified', msg: 'This user is already verified.' });
      // verify and save
      user.isVerified = true;
      user.save(function (err) {
        if (err) { return res.status(500).send({ msg: err.message }); }
        res.status(200).send("The account has been verified. Please log in.");
      });
    });
  });
});

router.post('/resend', function (req, res) {
  User.findOne({ email: req.body.email }, function (err, user) {
    if (!user) return res.status(400).send({ msg: 'We were unable to find a user with that email.' });
    if (user.isVerified) return res.status(400).send({ msg: 'This account has already been verified. Please log in.' });

    // create a verification token
    var token = new Token({ _userId: user._id, token: crypto.randomBytes(16).toString('hex') });

    // Save the token
    token.save(function (err) {
      if (err) { return res.status(500).send({ msg: err.message }); }

      // Send the email
      var transporter = nodemailer.createTransport({ service: 'Sendgrid', auth: { user: process.env.SENDGRID_USERNAME, pass: process.env.SENDGRID_PASSWORD } });
      var mailOptions = { from: 'yourmom@dood.com', to: user.email, subject: 'Account Verification Token', text: 'Hello,\n\n' + 'Please verify your account by clicking the link: \nhttp:\/\/' + req.headers.host + '\/confirmation\/' + token.token + '.\n' };
      transporter.sendMail(mailOptions, function (err) {
        if (err) { return res.status(500).send({ msg: err.message }); }
        res.status(200).send('A verification email has been sent to ' + user.email + '.');
      });
    });
  })
});

module.exports = router;
