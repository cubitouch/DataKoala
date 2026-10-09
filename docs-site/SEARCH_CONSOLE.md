# DataKoala — Google Search Console setup (owner-only)

These steps require access to the `cubitouch` GitHub account and the Google
account that owns the site. They are **owner-only** actions — they cannot be
automated or verified from a pull request, and no credentials are required in
this repository.

Do not claim indexing or ranking success until these are confirmed in Search
Console.

## 1. Verify ownership

1. Open <https://search.google.com/search-console> and sign in with the Google
   account that owns `cubitouch.github.io`.
2. Add a **Domain** property for `cubitouch.github.io` (or a **URL prefix**
   property for `https://cubitouch.github.io/DataKoala/`).
3. GitHub Pages sites are verified via the **HTML tag** method: copy the
   verification meta tag and add it to the `<head>` of
   `docs-site/index.html` in a local branch, push, and let Pages deploy. Once
   Search Console confirms the tag, remove it and redeploy.

## 2. Submit the sitemap

1. In Search Console, open **Sitemaps**.
2. Submit `sitemap.xml` (resolves to
   `https://cubitouch.github.io/DataKoala/sitemap.xml`).
3. Confirm the sitemap reports the canonical page
   `https://cubitouch.github.io/DataKoala/` and no preview URLs.

## 3. URL Inspection

1. Open **URL Inspection** and enter `https://cubitouch.github.io/DataKoala/`.
2. Click **Request indexing** after confirming the page renders the expected
   H1, product copy, and metadata.
3. Re-check after a few days; indexing is not immediate and is not guaranteed.

## Notes

- The project-level `robots.txt` was intentionally removed: on GitHub project
  Pages, `/DataKoala/robots.txt` is not the host-root `/robots.txt` that
  crawlers use for robots rules, so it was misleading. GitHub Pages serves the
  appropriate host-level robots rules automatically.
- The sitemap intentionally omits `<lastmod>` so it never advertises a stale
  modification date.
