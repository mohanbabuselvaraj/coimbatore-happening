import type { Post } from './product.ts';
// Refresh known entries without dropping loaded pages or exposing moderation data.
export async function revalidatePosts(posts:Post[],read:(ids:string[])=>Promise<{posts:Post[]}>) {
 const latest=new Map<string,Post>();
 for(let index=0;index<posts.length;index+=100){const page=await read(posts.slice(index,index+100).map(post=>post.id));for(const post of page.posts)latest.set(post.id,post);}
 return posts.flatMap(post=>{const current=latest.get(post.id);return current?[current]:[];});
}
