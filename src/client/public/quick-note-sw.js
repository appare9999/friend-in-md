// Present only so Chromium treats /quick-note.html as installable — this
// app is always used online against the local friend-in-md server, so there
// is nothing to cache or serve offline.
self.addEventListener("fetch", () => {});
