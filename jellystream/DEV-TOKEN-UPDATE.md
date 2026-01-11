# How to Update Dev Token (Simple Method)

When your Jellyfin token expires and you see 401 errors in JellyStream:

## Quick Update (30 seconds)

1. Open https://jellyfin.streamy.tube and make sure you're logged in
2. Press F12 to open DevTools → Console tab
3. Paste this and press Enter:
```javascript
var creds = JSON.parse(localStorage.getItem('jellyfin_credentials')).Servers[0];
var devToken = {
  ManualAddress: creds.ManualAddress,
  UserId: creds.UserId,
  AccessToken: creds.AccessToken,
  UserName: creds.UserName,
  Id: creds.Id
};
console.log('Copy this entire line and paste into splash-screen.js line 66:');
console.log("var accessToken = jellyfinCreds ? jellyfinCreds.AccessToken : '" + creds.AccessToken + "';");
```

4. Copy the entire line shown (starting with `var accessToken =`)
5. Open `splash-screen.js` in your editor
6. Replace line 66 with the copied line
7. Save and refresh JellyStream

Done! Token updated.
