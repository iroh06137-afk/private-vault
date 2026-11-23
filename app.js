import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const SIGNED_TTL = 1800;
const BUCKET = "vault";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: window.localStorage,
  },
});

const els = {
  authScreen: document.getElementById("auth-screen"),
  mainScreen: document.getElementById("main-screen"),
  authForm: document.getElementById("auth-form"),
  authEmail: document.getElementById("auth-email"),
  authPassword: document.getElementById("auth-password"),
  authSubmit: document.getElementById("auth-submit"),
  authToggle: document.getElementById("auth-toggle"),
  authError: document.getElementById("auth-error"),
  authNotice: document.getElementById("auth-notice"),
  countLabel: document.getElementById("count-label"),
  folderFilter: document.getElementById("folder-filter"),
  tagFilter: document.getElementById("tag-filter"),
  empty: document.getElementById("empty-state"),
  grid: document.getElementById("grid"),
  menuSheet: document.getElementById("menu-sheet"),
  uploadSheet: document.getElementById("upload-sheet"),
  editSheet: document.getElementById("edit-sheet"),
  uploadForm: document.getElementById("upload-form"),
  fileInput: document.getElementById("file-input"),
  fileSummary: document.getElementById("file-summary"),
  uploadFolder: document.getElementById("upload-folder"),
  uploadTags: document.getElementById("upload-tags"),
  uploadError: document.getElementById("upload-error"),
  uploadProgress: document.getElementById("upload-progress"),
  uploadBar: document.getElementById("upload-bar"),
  uploadStatus: document.getElementById("upload-status"),
  uploadSubmit: document.getElementById("upload-submit"),
  folderList: document.getElementById("folder-list"),
  viewer: document.getElementById("viewer"),
  viewerStage: document.getElementById("viewer-stage"),
  viewerName: document.getElementById("viewer-name"),
  viewerSub: document.getElementById("viewer-sub"),
  editForm: document.getElementById("edit-form"),
  editFolder: document.getElementById("edit-folder"),
  editTags: document.getElementById("edit-tags"),
};

let modeSignup = false;
let items = [];
let filtered = [];
let signed = new Map();
let currentIndex = -1;
let currentUser = null;

function show(el) { el.hidden = false; }
function hide(el) { el.hidden = true; }

function setText(el, text, kind) {
  if (!text) {
    hide(el);
    el.textContent = "";
    return;
  }
  el.textContent = text;
  show(el);
  if (kind) el.className = kind;
}

function parseTags(value) {
  return [...new Set((value || "")
    .split(/[,，、]/)
    .map((t) => t.trim())
    .filter(Boolean))];
}

function formatTags(tags) {
  return (tags || []).join("、");
}

function isVideo(mime) {
  return (mime || "").startsWith("video/");
}

function extOf(name, mime) {
  const fromName = (name || "").match(/(\.[a-z0-9]{1,8})$/i);
  if (fromName) return fromName[1].toLowerCase();
  if ((mime || "").includes("jpeg")) return ".jpg";
  if ((mime || "").includes("png")) return ".png";
  if ((mime || "").includes("webp")) return ".webp";
  if ((mime || "").includes("gif")) return ".gif";
  if ((mime || "").includes("heic") || (mime || "").includes("heif")) return ".heic";
  if ((mime || "").includes("quicktime")) return ".mov";
  if ((mime || "").includes("webm")) return ".webm";
  if ((mime || "").includes("mp4") || (mime || "").includes("m4v")) return ".mp4";
  return "";
}

async function makeImageThumb(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement("canvas");
    const max = 480;
    const scale = Math.min(max / bitmap.width, max / bitmap.height, 1);
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  } catch {
    return null;
  }
}

function makeVideoThumb(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;
    const finish = (blob) => {
      if (settled) return;
      settled = true;
      URL.revokeObjectURL(url);
      resolve(blob);
    };
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.src = url;
    video.onloadeddata = () => {
      try {
        video.currentTime = Math.min(0.8, (video.duration || 1) * 0.1);
      } catch {
        finish(null);
      }
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        const w = video.videoWidth || 480;
        const h = video.videoHeight || 270;
        const scale = Math.min(480 / w, 480 / h, 1);
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => finish(blob), "image/jpeg", 0.8);
      } catch {
        finish(null);
      }
    };
    video.onerror = () => finish(null);
    setTimeout(() => finish(null), 8000);
  });
}

async function signedUrl(path) {
  if (!path) return null;
  const hit = signed.get(path);
  if (hit && hit.expires > Date.now() + 15_000) return hit.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_TTL);
  if (error || !data?.signedUrl) return null;
  signed.set(path, { url: data.signedUrl, expires: Date.now() + SIGNED_TTL * 1000 });
  return data.signedUrl;
}

async function signedUrls(paths) {
  const unique = [...new Set(paths.filter(Boolean))];
  const missing = unique.filter((p) => {
    const hit = signed.get(p);
    return !(hit && hit.expires > Date.now() + 15_000);
  });
  if (missing.length) {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(missing, SIGNED_TTL);
    if (!error && data) {
      for (const row of data) {
        if (row?.signedUrl && row.path) {
          signed.set(row.path, { url: row.signedUrl, expires: Date.now() + SIGNED_TTL * 1000 });
        }
      }
    }
  }
  return Object.fromEntries(unique.map((p) => [p, signed.get(p)?.url || null]));
}

function applyFilters() {
  const folder = els.folderFilter.value;
  const tag = els.tagFilter.value.trim();
  filtered = items.filter((item) => {
    if (folder && item.folder !== folder) return false;
    if (tag && !(item.tags || []).some((t) => t.includes(tag))) return false;
    return true;
  });
  renderGrid();
}

function refreshFolderOptions() {
  const folders = [...new Set(items.map((i) => i.folder).filter(Boolean))].sort();
  const current = els.folderFilter.value;
  els.folderFilter.innerHTML = '<option value="">すべてのフォルダ</option>' +
    folders.map((f) => `<option value="${escapeAttr(f)}">${escapeHtml(f)}</option>`).join("");
  if (folders.includes(current)) els.folderFilter.value = current;
  els.folderList.innerHTML = folders.map((f) => `<option value="${escapeAttr(f)}"></option>`).join("");
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeAttr(s) {
  return escapeHtml(s);
}

function renderGrid() {
  const n = items.length;
  els.countLabel.textContent = n ? `${n}件` : "";
  if (!filtered.length) {
    hide(els.grid);
    els.grid.innerHTML = "";
    show(els.empty);
    els.empty.querySelector("p").textContent = items.length
      ? "条件に合うものがありません。"
      : "まだ何も入っていません。";
    return;
  }
  hide(els.empty);
  show(els.grid);
  els.grid.innerHTML = filtered.map((item, i) => {
    const thumb = signed.get(item.thumb_path)?.url || signed.get(item.storage_path)?.url || "";
    const video = item.media_type === "video";
    return `<button type="button" class="tile" data-id="${item.id}" data-index="${i}" aria-label="${escapeAttr(item.filename)}">
      ${thumb ? `<img alt="" src="${escapeAttr(thumb)}" />` : `<div class="muted" style="padding:12px">${escapeHtml(item.filename)}</div>`}
      ${video ? `<span class="badge">動画</span>` : ""}
    </button>`;
  }).join("");
}

async function loadMedia() {
  if (!currentUser) return;
  const { data, error } = await supabase
    .from("media")
    .select("id,filename,storage_path,thumb_path,mime_type,media_type,tags,folder,size_bytes,created_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });
  if (error) {
    console.error(error);
    return;
  }
  items = data || [];
  const paths = [];
  for (const item of items) {
    if (item.thumb_path) paths.push(item.thumb_path);
    else paths.push(item.storage_path);
  }
  await signedUrls(paths);
  refreshFolderOptions();
  applyFilters();
}

function setAuthMode(signup) {
  modeSignup = signup;
  els.authSubmit.textContent = signup ? "アカウントを作成" : "ログイン";
  els.authToggle.textContent = signup ? "すでにアカウントがある（ログイン）" : "初めて使う（アカウント作成）";
  els.authPassword.autocomplete = signup ? "new-password" : "current-password";
  setText(els.authError, "");
  setText(els.authNotice, "");
}

function showAuth() {
  show(els.authScreen);
  hide(els.mainScreen);
  hide(els.viewer);
}

function showMain() {
  hide(els.authScreen);
  show(els.mainScreen);
}

function openSheet(which) {
  show(document.getElementById(`${which}-sheet`));
}

function closeSheet(which) {
  hide(document.getElementById(`${which}-sheet`));
}

async function openViewer(index) {
  if (index < 0 || index >= filtered.length) return;
  currentIndex = index;
  const item = filtered[index];
  const url = await signedUrl(item.storage_path);
  els.viewerStage.innerHTML = "";
  if (!url) {
    els.viewerStage.textContent = "読み込めませんでした。";
  } else if (item.media_type === "video") {
    const video = document.createElement("video");
    video.src = url;
    video.controls = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.preload = "metadata";
    video.controlslist = "nodownload";
    els.viewerStage.appendChild(video);
  } else {
    const img = document.createElement("img");
    img.alt = item.filename;
    img.src = url;
    els.viewerStage.appendChild(img);
  }
  els.viewerName.textContent = item.filename;
  const parts = [];
  if (item.folder) parts.push(item.folder);
  if (item.tags?.length) parts.push(formatTags(item.tags));
  parts.push(new Date(item.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }));
  els.viewerSub.textContent = parts.join(" · ");
  show(els.viewer);
}

function closeViewer() {
  const video = els.viewerStage.querySelector("video");
  if (video) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
  els.viewerStage.innerHTML = "";
  hide(els.viewer);
  currentIndex = -1;
}

async function deleteCurrent() {
  const item = filtered[currentIndex];
  if (!item) return;
  if (!confirm(`「${item.filename}」を削除しますか？この操作は取り消せません。`)) return;
  const paths = [item.storage_path, item.thumb_path].filter(Boolean);
  const { error: storageError } = await supabase.storage.from(BUCKET).remove(paths);
  if (storageError) {
    alert("ファイルの削除に失敗しました。");
    return;
  }
  const { error } = await supabase.from("media").delete().eq("id", item.id);
  if (error) {
    alert("記録の削除に失敗しました。");
    return;
  }
  closeViewer();
  await loadMedia();
}

async function saveEdit(event) {
  event.preventDefault();
  const item = filtered[currentIndex];
  if (!item) return;
  const folder = els.editFolder.value.trim();
  const tags = parseTags(els.editTags.value);
  const { error } = await supabase.from("media").update({ folder, tags }).eq("id", item.id);
  if (error) {
    alert("保存に失敗しました。");
    return;
  }
  closeSheet("edit");
  await loadMedia();
  const idx = filtered.findIndex((x) => x.id === item.id);
  if (idx >= 0) openViewer(idx);
}

function uploadPath(userId, id, filename, mime) {
  return `${userId}/${id}${extOf(filename, mime)}`;
}

async function uploadFiles(event) {
  event.preventDefault();
  const files = [...els.fileInput.files];
  if (!files.length || !currentUser) return;
  setText(els.uploadError, "");
  show(els.uploadProgress);
  els.uploadSubmit.disabled = true;
  const folder = els.uploadFolder.value.trim();
  const tags = parseTags(els.uploadTags.value);
  let done = 0;
  const total = files.length;
  for (const file of files) {
    els.uploadStatus.textContent = `${done + 1} / ${total}　${file.name}`;
    els.uploadBar.style.width = `${Math.round((done / total) * 100)}%`;
    const id = crypto.randomUUID();
    const mediaType = isVideo(file.type) || /\.(mp4|mov|m4v|webm|3gp)$/i.test(file.name) ? "video" : "photo";
    const storagePath = uploadPath(currentUser.id, id, file.name, file.type);
    const { error: upError } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || undefined,
    });
    if (upError) {
      setText(els.uploadError, `${file.name} のアップロードに失敗しました：${upError.message}`);
      els.uploadSubmit.disabled = false;
      return;
    }
    let thumbPath = null;
    const thumb = mediaType === "video" ? await makeVideoThumb(file) : await makeImageThumb(file);
    if (thumb) {
      thumbPath = `${currentUser.id}/thumbs/${id}.jpg`;
      const { error: thumbError } = await supabase.storage.from(BUCKET).upload(thumbPath, thumb, {
        cacheControl: "3600",
        upsert: false,
        contentType: "image/jpeg",
      });
      if (thumbError) thumbPath = null;
    }
    const { error: rowError } = await supabase.from("media").insert({
      id,
      user_id: currentUser.id,
      filename: file.name,
      storage_path: storagePath,
      thumb_path: thumbPath,
      mime_type: file.type || (mediaType === "video" ? "video/mp4" : "application/octet-stream"),
      media_type: mediaType,
      tags,
      folder,
      size_bytes: file.size,
    });
    if (rowError) {
      await supabase.storage.from(BUCKET).remove([storagePath, thumbPath].filter(Boolean));
      setText(els.uploadError, `${file.name} の保存に失敗しました：${rowError.message}`);
      els.uploadSubmit.disabled = false;
      return;
    }
    done += 1;
    els.uploadBar.style.width = `${Math.round((done / total) * 100)}%`;
  }
  els.uploadStatus.textContent = "完了しました";
  els.fileInput.value = "";
  els.fileSummary.textContent = "";
  els.uploadSubmit.disabled = true;
  await loadMedia();
  setTimeout(() => {
    hide(els.uploadProgress);
    closeSheet("upload");
    els.uploadBar.style.width = "0";
    els.uploadSubmit.disabled = true;
  }, 400);
}

function summarizeFiles() {
  const files = [...els.fileInput.files];
  els.uploadSubmit.disabled = files.length === 0;
  els.fileSummary.textContent = files.length
    ? `${files.length}件（${(files.reduce((s, f) => s + f.size, 0) / 1048576).toFixed(1)} MB）`
    : "";
}

async function onAuthSubmit(event) {
  event.preventDefault();
  setText(els.authError, "");
  setText(els.authNotice, "");
  const email = els.authEmail.value.trim();
  const password = els.authPassword.value;
  els.authSubmit.disabled = true;
  try {
    if (modeSignup) {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) throw error;
      if (data.user && !data.session) {
        setText(
          els.authNotice,
          "確認メールを送りました。メール内のリンクを開いてから、ここからログインしてください。届かないときは迷惑メールも確認してください。",
        );
        return;
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (err) {
    setText(els.authError, toFriendlyError(err));
  } finally {
    els.authSubmit.disabled = false;
  }
}

function toFriendlyError(err) {
  const msg = (err && err.message) || "エラーが発生しました。";
  if (/invalid login/i.test(msg)) return "メールアドレスまたはパスワードが違います。";
  if (/already registered|already been registered/i.test(msg)) return "このメールアドレスはすでに登録されています。ログインしてください。";
  if (/email/i.test(msg) && /confirm/i.test(msg)) return "メールアドレスの確認がまだです。確認メールのリンクを開いてください。";
  if (/rate/i.test(msg)) return "少し時間をおいてからやり直してください。";
  if (/password/i.test(msg)) return "パスワードは8文字以上にしてください。";
  return msg;
}

async function onReady(session) {
  currentUser = session?.user || null;
  if (!currentUser) {
    items = [];
    filtered = [];
    signed.clear();
    showAuth();
    return;
  }
  showMain();
  await loadMedia();
}

els.authForm.addEventListener("submit", onAuthSubmit);
els.authToggle.addEventListener("click", () => setAuthMode(!modeSignup));
document.getElementById("btn-upload").addEventListener("click", () => openSheet("upload"));
document.getElementById("btn-upload-empty").addEventListener("click", () => openSheet("upload"));
document.getElementById("btn-menu").addEventListener("click", () => openSheet("menu"));
document.getElementById("btn-logout").addEventListener("click", async () => {
  closeSheet("menu");
  await supabase.auth.signOut();
});
els.fileInput.addEventListener("change", summarizeFiles);
els.uploadForm.addEventListener("submit", uploadFiles);
els.folderFilter.addEventListener("change", applyFilters);
els.tagFilter.addEventListener("input", applyFilters);
els.grid.addEventListener("click", (event) => {
  const tile = event.target.closest(".tile");
  if (!tile) return;
  openViewer(Number(tile.dataset.index));
});
document.getElementById("viewer-close").addEventListener("click", closeViewer);
document.getElementById("viewer-prev").addEventListener("click", () => openViewer(currentIndex - 1));
document.getElementById("viewer-next").addEventListener("click", () => openViewer(currentIndex + 1));
document.getElementById("viewer-delete").addEventListener("click", deleteCurrent);
document.getElementById("viewer-edit").addEventListener("click", () => {
  const item = filtered[currentIndex];
  if (!item) return;
  els.editFolder.value = item.folder || "";
  els.editTags.value = formatTags(item.tags);
  openSheet("edit");
});
els.editForm.addEventListener("submit", saveEdit);
document.addEventListener("click", (event) => {
  const which = event.target.dataset?.close;
  if (which) closeSheet(which);
});
document.addEventListener("keydown", (event) => {
  if (els.viewer.hidden) return;
  if (event.key === "Escape") closeViewer();
  if (event.key === "ArrowLeft") openViewer(currentIndex - 1);
  if (event.key === "ArrowRight") openViewer(currentIndex + 1);
});

let touchX = null;
els.viewerStage.addEventListener("touchstart", (event) => {
  touchX = event.changedTouches[0].clientX;
}, { passive: true });
els.viewerStage.addEventListener("touchend", (event) => {
  if (touchX == null) return;
  const dx = event.changedTouches[0].clientX - touchX;
  touchX = null;
  if (dx > 50) openViewer(currentIndex - 1);
  if (dx < -50) openViewer(currentIndex + 1);
}, { passive: true });

supabase.auth.onAuthStateChange((_event, session) => {
  onReady(session);
});

const { data: initial } = await supabase.auth.getSession();
await onReady(initial.session);

if ("serviceWorker" in navigator) {
  try {
    await navigator.serviceWorker.register("./sw.js");
  } catch {
    // オフライン用なので失敗してもアプリは使える
  }
}

setAuthMode(false);
