# Beta password gate (CloudFront Basic Auth)

Password-protects **beta.filterboxbuilder.com** with one shared username/password,
using a CloudFront Function at the edge. It does not touch the apex
(filterboxbuilder.com) or the www site: it is attached only to the beta
distribution.

`function.js` is the function. It returns `401` unless the request carries the
expected HTTP Basic Auth header.

## 1. Set the password

CloudFront Functions cannot compute base64 at runtime, so precompute the credential
and paste it into `function.js` (the `expected` variable):

```sh
echo -n 'beta:YOUR_PASSWORD' | base64
# example output: YmV0YTpZT1VSX1BBU1NXT1JE
```

Set `var expected = "Basic <that output>";`. The username is `beta` here; change it
in the command if you want a different one. Keep the real password out of git: only
the base64 of `user:pass` lives in the function, and ideally you set it directly in
the console rather than committing it.

## 2. Create and publish the function

AWS console: **CloudFront -> Functions -> Create function** (name e.g.
`beta-basic-auth`), paste `function.js`, **Save changes -> Publish**.

(CLI alternative: `aws cloudfront create-function --name beta-basic-auth
--function-config Comment="beta gate",Runtime=cloudfront-js-2.0
--function-code fileb://function.js`, then `publish-function`.)

## 3. Attach it to the BETA distribution only

CloudFront -> Distributions -> the distribution serving **beta.filterboxbuilder.com**
-> **Behaviors** -> select the default `*` behavior -> **Edit** -> **Function
associations** -> **Viewer request** -> Function type **CloudFront Functions** ->
pick `beta-basic-auth` -> **Save**.

Confirm you are on the beta distribution, not the apex/www one. The beta gate must
not end up in front of filterboxbuilder.com.

## 4. Verify

Load `https://beta.filterboxbuilder.com` in a private window: the browser should show
a login prompt. Wrong/empty credentials return 401; `beta` + your password loads the
site. Confirm `https://filterboxbuilder.com` is still open to everyone.

## Changing or revoking the password

Recompute the base64 (step 1), update the function code, **Publish** again. The live
behavior picks up the published version. To remove the gate entirely, detach the
function from the beta behavior's Viewer request slot.

## Caveats

- Single shared password, not per-user accounts. Basic Auth is base64 (not
  encryption) but travels over HTTPS, which is fine for a beta gate.
- For per-user access or individual revocation later, you would move to
  Lambda@Edge with a user list, or put the beta behind Cognito. Bigger lift.
