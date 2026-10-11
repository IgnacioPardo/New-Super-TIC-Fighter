# Music streaming

Cloudflare Workers Static Assets currently returns full MP3 responses for byte-range requests ([upstream issue](https://github.com/cloudflare/workers-sdk/issues/8967)). Chromium and Firefox cannot seek into an unbuffered part of these responses. The Worker handles MP3 requests only, preserving the original asset headers and serving single byte ranges with bounded streaming and `FixedLengthStream`. All other static assets retain asset-first routing.

The asset binding omits inferred `Content-Length` internally, so `public/_headers` contains generated lengths for the 25 music tracks. The importer refreshes them automatically. After replacing music or editing the manifest, run `python3 scripts/make-audio-headers.py`, then `python3 scripts/make-audio-headers.py --check` before building and deploying. Do not edit the generated block manually.

Normal GET and HEAD responses remain 200. GET supports closed, open-ended, and suffix ranges with 206, and unsatisfiable ranges with 416. A mismatched or weak `If-Range` returns the full representation; asset validators still support 304. Malformed or multipart ranges are ignored and return the full response. No extra storage or paid service is used; MP3 requests use the existing free Worker request allowance.
