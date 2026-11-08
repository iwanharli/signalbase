"use client";
// Preview of /media/social seen through a key: key banner, search and filters, mood summary, masonry of post cards.
import { IconEye, IconHeart, IconKey, IconMessageCircle, IconRepeat, IconSearch, IconSparkles } from "@tabler/icons-react";
import { KEY_NAME, KEYWORDS, MEDIA_FILTERS, POSTS } from "./data";
import c from "./preview.module.css";

const COLUMNS = 3;

function PostCard({ post, index }: { post: (typeof POSTS)[number]; index: number }) {
  const [moodLabel, moodColor] = post.mood;
  return (
    <article className={c.card} style={{ animationDelay: `${index * 70}ms`, ["--tone" as string]: moodColor }}>
      {post.image && <div className={c.cardImage} style={{ background: post.image }}><span>{post.platform === "Instagram" ? "Foto" : "Video"}</span></div>}
      <header>
        <span className={c.avatar} style={{ ["--hue" as string]: `${(index * 83 + 250) % 360}` }}>{post.author.charAt(0)}</span>
        <div><b>{post.author}</b><small>{post.handle} · {post.platform}</small></div>
        <span className={c.moodBadge} style={{ color: moodColor }}>{moodLabel}</span>
      </header>
      <p>{post.text}</p>
      <div className={c.cardTags}><span className={c.aiTag}><IconSparkles size={10} />{post.topic}</span></div>
      <footer>
        <span><IconHeart size={12} />{post.stats[0]}</span>
        <span><IconMessageCircle size={12} />{post.stats[1]}</span>
        <span><IconRepeat size={12} />{post.stats[2]}</span>
        <time>{post.time}</time>
      </footer>
    </article>
  );
}

export function MediaView() {
  return (
    <>
      <div className={c.keyBanner}>
        <span className={c.keyBannerIcon}><IconEye size={15} /></span>
        <div>
          <small><IconKey size={11} />Dilihat sebagai kunci</small>
          <b>{KEY_NAME}</b>
          <p>{KEYWORDS.join(", ")} · kategorisasi AI aktif</p>
        </div>
        <span className={c.bannerBtn}><IconSparkles size={12} />AI</span>
      </div>

      <div className={c.searchRow}>
        <span className={c.search}><IconSearch size={14} />Cari post, tagar, atau akun…</span>
        {MEDIA_FILTERS.map((f) => <span key={f} className={c.filter}>{f}</span>)}
      </div>

      <div className={c.stats}>
        <b>3.214</b> post · <span style={{ color: "#3b82f6" }}>Netral 41%</span> · <span style={{ color: "#10b981" }}>Mendukung 27%</span> · <span style={{ color: "#f97316" }}>Menolak 14%</span>
      </div>

      {/* Dealt round-robin into columns like the real Masonry, so each card keeps its own height. */}
      <div className={c.masonry}>
        {Array.from({ length: COLUMNS }, (_, col) => (
          <div key={col} className={c.masonryCol}>
            {POSTS.map((post, index) => (index % COLUMNS === col ? <PostCard key={post.author} post={post} index={index} /> : null))}
          </div>
        ))}
      </div>
    </>
  );
}
