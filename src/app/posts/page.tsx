import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listPosts } from "@/lib/posts";
import { cancel, publishDraft, retry } from "../actions";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  publishing: "Publishing",
  done: "Published",
  failed: "Failed",
  cancelled: "Cancelled",
  pending: "Waiting",
  processing: "Processing",
  published: "Published",
};

function when(d: Date | null) {
  return d ? d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
}

export default async function PostsPage() {
  const { uid } = await requireUser();
  const posts = await listPosts(uid);

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h1>Posts</h1>
        <Link className="button" href="/compose">
          New post
        </Link>
      </div>
      {posts.length === 0 && <p className="card muted">Nothing posted yet.</p>}
      {posts.map(({ post, targets }) => (
        <div className="card" key={post.id}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className={`badge s-${post.status}`}>{STATUS[post.status] ?? post.status}</span>
            <span className="muted small">
              {post.status === "scheduled" ? `Goes out ${when(post.scheduledAt)}` : `Created ${when(post.createdAt)}`}
              {post.createdBy === "ai" && " · by an AI tool"}
            </span>
          </div>
          <p style={{ whiteSpace: "pre-wrap" }}>{post.caption || <span className="muted">No caption</span>}</p>
          {post.mediaIds.length > 0 && (
            <p className="muted small">
              {post.mediaIds.length} media file{post.mediaIds.length > 1 ? "s" : ""}
            </p>
          )}
          <ul className="targets">
            {targets.map(({ target, account }) => (
              <li key={target.id}>
                <span className={`badge s-${target.status}`}>{STATUS[target.status] ?? target.status}</span> {account.displayName}
                {target.remoteUrl && (
                  <>
                    {" · "}
                    <a href={target.remoteUrl} target="_blank" rel="noreferrer">
                      View post
                    </a>
                  </>
                )}
                {target.error && <div className="small s-failed">{target.error}</div>}
              </li>
            ))}
          </ul>
          <div className="row" style={{ marginTop: 8 }}>
            {post.status === "failed" && (
              <form action={retry}>
                <input type="hidden" name="postId" value={post.id} />
                <button>Retry failed</button>
              </form>
            )}
            {post.status === "draft" && (
              <form action={publishDraft}>
                <input type="hidden" name="postId" value={post.id} />
                <button>Publish now</button>
              </form>
            )}
            {(post.status === "draft" || post.status === "scheduled") && (
              <form action={cancel}>
                <input type="hidden" name="postId" value={post.id} />
                <button className="secondary">Cancel</button>
              </form>
            )}
          </div>
        </div>
      ))}
    </>
  );
}
