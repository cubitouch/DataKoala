# DataKoala — Google Search Console setup (owner-only)

Search Console can help establish whether the public GitHub Pages site is
indexed. Verification, sitemap submission, and URL Inspection require the
site owner's Google account; do not add Google credentials or API tokens
to this repository. Do not claim indexing or ranking success until
Search Console confirms it.

## 1. Verify ownership of the project website

1. Open <https://search.google.com/search-console> using the Google account
   that should own the property.
2. Choose a **URL-prefix** property with the exact URL
   `https://cubitouch.github.io/DataKoala/`. This is appropriate for the
   GitHub Pages project path. An HTML verification tag works for URL-prefix
   properties, **not** for Domain properties. A Domain property requires
   DNS verification and control of the domain's DNS records.
3. In Search Console, choose the **HTML tag** verification method. Add the
   exact `<meta name="google-site-verification" ...>` tag supplied by Google
   inside `<head>` in `docs-site/index.html`.
4. Commit the change, merge it, and deploy the normal GitHub Pages build from
   `main`. A PR preview is not the public site.
5. Use **View Page Source** at `https://cubitouch.github.io/DataKoala/`
   to confirm the tag is present in the deployed HTML. Then choose **Verify**
   in Search Console.
6. **Keep the tag in the deployed HTML after verification.** Google checks it
   periodically; removing it can revoke verified ownership.

The verification tag is public by design, not a password. Do not copy
credentials, cookies, or private account information into the repository.
You can instead use another verification method that Search Console offers
for your chosen property if you prefer.

[Google's official ownership verification instructions](https://support.google.com/webmasters/answer/9008080?hl=en)

## 2. Submit the sitemap

1. In Search Console, open **Sitemaps** for the URL-prefix property.
2. Submit `sitemap.xml` under that property, or confirm the full URL
   `https://cubitouch.github.io/DataKoala/sitemap.xml`.
3. Check that the live sitemap references the canonical page
   `https://cubitouch.github.io/DataKoala/`, not a preview.
4. Check Search Console's processing status before drawing conclusions;
   submission alone does not imply indexing.

## 3. Inspect indexing and track results

1. Inspect `https://cubitouch.github.io/DataKoala/` using **URL Inspection**.
2. Verify that Google can fetch the URL and see the expected H1, copy,
   canonical, and metadata. Use **Request indexing** if appropriate.
3. Revisit the results over the following days/weeks. Indexing and search
   impressions are not immediate or guaranteed.
4. Record the indexing status and branded/non-branded impressions as a
   baseline when data becomes available. Do not treat a `site:` search
   alone as definitive evidence of indexed status.

## GitHub Pages notes

- A file at `/DataKoala/robots.txt` would not control robots rules for
  the host `cubitouch.github.io`; the effective robots.txt URL is the
  host-root `/robots.txt`. This repository intentionally does not ship a
  misleading project-level robots file.
- The sitemap omits `<lastmod>` to avoid advertising a permanently stale
  modification date.
