# AI Day 360° Gallery

A website that shows the students' 360° films from one YouTube playlist. You manage the films on YouTube; the website updates by itself.

## What's in the folder

| File | What it does |
| --- | --- |
| `index.html` | The page |
| `css/styles.css` | The design |
| `js/config.js` | **The only file you need to edit** (your playlist ID) |
| `js/strings.js` | All the text on the site, in English and Spanish |
| `js/background.js` | The animated space background |
| `js/playlist.js` | Reads the YouTube playlist |
| `js/viewer.js` | The full-screen player |
| `js/main.js` | Connects everything |

## 1. Prepare YouTube (once)

1. Upload each 360° video to YouTube.
   - Visibility: **Unlisted** (not Private: private videos can't be shown on the website).
   - Under **Show more**, keep **Allow embedding** ticked (it's on by default).
   - Title format: `Group 1 – Astronaut in the fields`. The site shows "Group 1" and the title separately.
2. Create a playlist, set it to **Unlisted**, and add the videos in the order you want.
3. Wait until 360° works on YouTube itself (you can drag to look around). New 360° videos can take a while to process.

## 2. Add your playlist ID (once)

1. Open the playlist on YouTube. The address looks like
   `https://www.youtube.com/playlist?list=PLabc123XYZ`
2. Copy the part after `list=`.
3. Open `js/config.js` in any text editor and paste it between the quotes:
   `export const PLAYLIST_ID = 'PLabc123XYZ';`
4. Save.

## 3. Test it on your computer (optional)

The site must be opened through a small local server, not by double-clicking `index.html`.

In Terminal, inside this folder, run one of these:

```
python3 -m http.server 8000
```
or
```
npx serve
```

Then open `http://localhost:8000` (or the address `npx serve` shows).

## 4. Put it online (once)

1. Create a free account at **netlify.com** (so the site doesn't expire).
2. Go to **app.netlify.com/drop** and drag this whole folder onto the page.
3. Netlify gives you an address like `https://something.netlify.app`. In **Site configuration → Change site name** you can rename it, for example `aiday-tgc.netlify.app`.
4. Make a short link at **tinyurl.com** for the headsets, for example `tinyurl.com/aiday-tgc`.

## On the day

You don't touch the website. To add, remove or reorder films, change the playlist on YouTube. Open pages pick up the changes when they're reloaded or when a headset wakes up.

## The 360° gallery

The main button opens a space where the films float all around you.

- **Meta Quest:** the button says **Enter VR**. Point at a film with the controller and press the trigger. The film opens on YouTube in 360°; use the browser's Back button to return.
- **Computer:** drag to look around, click a film to watch it. The arrow keys move between films and Enter opens one.
- **Phone:** drag with a finger to look around, tap a film.

The films in the gallery come from the same YouTube playlist, so there is nothing extra to update.

## If something goes wrong

| Problem | Fix |
| --- | --- |
| "Add your YouTube playlist ID…" | `js/config.js` still has `PASTE_PLAYLIST_ID_HERE`. Paste the ID and upload the folder to Netlify again. |
| "Can't load the playlist…" | The playlist is Private, the ID is wrong, or YouTube is blocked on the network. |
| A film shows "Video unavailable" | That video is Private, or embedding is turned off. Make it Unlisted and allow embedding. |
| Titles show "Film 1, Film 2…" | YouTube didn't return the titles. Reload, or add an API key (below). |
| The film is flat, not 360° | YouTube hasn't finished processing 360°, or the video was exported without "Video is VR". |
| Changes don't appear | Reload the page. To change the website itself (text, design), drag the folder onto Netlify again. |

## Change the text

Open `js/strings.js`. Change the words between the quotes, in English (`en`) and Spanish (`es`). Upload the folder to Netlify again.

## Optional: YouTube API key

Without a key the site works, but titles depend on a public YouTube service. With a key, titles load in one request.

1. Go to **console.cloud.google.com**, create a project, and enable **YouTube Data API v3**.
2. **Credentials → Create credentials → API key**.
3. Edit the key: under **API restrictions** choose YouTube Data API v3; under **Application restrictions** choose **Websites** and add `https://your-site.netlify.app/*`. The key is visible in the page, so these restrictions matter.
4. Paste it into `js/config.js`: `export const YOUTUBE_API_KEY = 'AIza...';`
