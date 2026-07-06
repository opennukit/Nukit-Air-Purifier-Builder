// CloudFront Function (viewer-request) — HTTP Basic Auth for beta.filterboxbuilder.com
//
// Gates the BETA distribution behind one shared username/password. Attach it ONLY
// to the beta CloudFront distribution's default (*) behavior as a Viewer request
// function. Do NOT attach it to the apex (filterboxbuilder.com) or www distribution.
//
// Runtime: cloudfront-js-2.0. CloudFront Functions have no atob/btoa, so the
// credential is PRECOMPUTED and pasted in as a base64 string (see README).

function handler(event) {
  var request = event.request;
  var headers = request.headers;

  // Replace with: "Basic " + base64("beta:YOUR_PASSWORD")
  //   echo -n 'beta:YOUR_PASSWORD' | base64
  var expected = "Basic YmV0YTpZT1VSX1BBU1NXT1JE"; // beta:YOUR_PASSWORD (placeholder)

  if (!headers.authorization || headers.authorization.value !== expected) {
    return {
      statusCode: 401,
      statusDescription: "Unauthorized",
      headers: {
        "www-authenticate": { value: 'Basic realm="FilterBoxBuilder beta"' },
      },
    };
  }

  return request;
}
