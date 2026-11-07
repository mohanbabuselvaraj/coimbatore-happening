import './admin.css';
import { headers } from 'next/headers';
import { env } from 'cloudflare:workers';
import { adminAccess } from '../../lib/admin-access';
import { chatGPTSignInPath } from '../chatgpt-auth';
import AdminDashboard from '../../components/AdminDashboard';
export const dynamic='force-dynamic';
export const metadata={title:'Administration · Coimbatore',robots:{index:false,follow:false}};
export default async function AdminPage(){
 const access=adminAccess(new Headers(await headers()),env.ADMIN_OWNER_EMAIL);
 if(access.status!==200)return <main className="admin-gate"><h1>Administration</h1><p>{access.message}</p>{access.status===401&&<a className="primary-button" href={chatGPTSignInPath('/admin')} target="_top">Sign in with ChatGPT</a>}<a href="/">Back to the map</a></main>;
 return <AdminDashboard/>;
}
