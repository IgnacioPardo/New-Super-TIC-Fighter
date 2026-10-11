import { useEffect, useId, useState, type ReactNode } from 'react';
import type { Language } from '../shared/types';
import { MenuTabs } from './MenuControls';

/** Keep editors mounted while their page is hidden, so drafts and active connections survive. */
export function ContentTabs({label,pages}:{label:string;pages:{id:string;label:string;content:ReactNode}[]}) {
 const [selected,setSelected]=useState(pages[0].id),id=useId();
 const active=pages.some(page=>page.id===selected)?selected:pages[0].id;
 return <div className="content-pages">
  <MenuTabs label={label} value={active} options={pages.map(page=>({value:page.id,label:page.label}))} change={setSelected}/>
  {pages.map(page=><div className="content-page" role="tabpanel" aria-label={page.label} id={`${id}-${page.id}`} hidden={page.id!==active} key={page.id}>{page.content}</div>)}
 </div>;
}
export function usePageSize(desktop:number,narrow:number) {
 const [small,setSmall]=useState(()=>window.innerWidth<=760);
 useEffect(()=>{const query=matchMedia('(max-width:760px)'),change=()=>setSmall(query.matches);query.addEventListener('change',change);return()=>query.removeEventListener('change',change);},[]);
 return small?narrow:desktop;
}
export function Pager({page,count,change,language,label}:{page:number;count:number;change:(page:number)=>void;language:Language;label:string}) {
 if(count<=1)return null;
 const es=language==='es';
 return <nav className="content-pager" aria-label={label} data-menu-linear>
  <button className="small-button" disabled={page===0} onClick={()=>change(page-1)} aria-label={`${es?'Página anterior':'Previous page'} · ${label}`}>← {es?'Anterior':'Previous'}</button>
  <span aria-live="polite">{page+1} / {count}</span>
  <button className="small-button" disabled={page>=count-1} onClick={()=>change(page+1)} aria-label={`${es?'Página siguiente':'Next page'} · ${label}`}>{es?'Siguiente':'Next'} →</button>
 </nav>;
}
export function PagedContent({children,size,language,label,className=''}:{children:ReactNode[];size:number;language:Language;label:string;className?:string}) {
 const [selected,setSelected]=useState(0),count=Math.max(1,Math.ceil(children.length/size)),page=Math.min(selected,count-1);
 const Items=className.includes('feature-list')?'ul':'div';
 return <div className="paged-content"><Items className={className}>{children.slice(page*size,(page+1)*size)}</Items><Pager page={page} count={count} change={setSelected} language={language} label={label}/></div>;
}
