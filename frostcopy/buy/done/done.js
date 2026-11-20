// After the payment: fetches the license for the payment in the address (?session=…) and shows it.
const el = (id) => document.getElementById(id);
const session = new URLSearchParams(location.search).get("session") || "";

function show(title, lead) {
  el("title").textContent = title;
  el("lead").textContent = lead;
}
async function fetchLicense(tries) {
  const answer = await fetch("/frostcopy/api/order?session=" + encodeURIComponent(session));
  const data = await answer.json().catch(() => ({}));
  if (answer.status === 409 && tries > 0) {
    await new Promise((r) => setTimeout(r, 2000));
    return fetchLicense(tries - 1);
  }
  if (!answer.ok || !data.code) throw new Error(data.error || "We could not fetch the license. Reload the page in a moment.");
  return data;
}
if (!session) show("No purchase found", "This page shows a license right after a purchase. Start from the price page.");
else
  fetchLicense(8).then(
    (d) => {
      show("Thank you", "The license for " + d.name + " is ready. It lasts until " + new Date(d.expires + "T12:00:00Z").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) + ".");
      el("code").value = d.code;
      const text = "License for FrostCopy: " + d.name + "\n\nDouble-click this file, or drop it on the FrostCopy window, and FrostCopy is activated.\nYou can also paste the code below in FrostCopy › License.\n\n" + d.code + "\n";
      el("file").href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
      el("file").download = "FrostCopy license.frostcopylicense";
      el("open").href = "frostcopy://aktiver?kode=" + encodeURIComponent(d.code);
      el("copy").addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(d.code); } catch { el("code").select(); document.execCommand("copy"); }
        el("copy").textContent = "Copied";
      });
      el("test").hidden = !d.test;
      el("result").hidden = false;
    },
    (e) => show("Something went wrong", e.message)
  );
