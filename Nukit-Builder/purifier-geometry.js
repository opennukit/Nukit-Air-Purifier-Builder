// ============================================================================
//  Nukit Air-Purifier Builder
//
//  Full builder: horizontal layout (Filters 1 & 2),
//  4-filter tower (Filters 4), the chamfered/rounded filter openings,
//  hex-grill fan windows, filter slots, cord pass-through, alignment-pin
//  holes at chunk seams, and 3D-print chunking (Render_part = chunk).
//
//  Pure function of `jscadModeling` so it runs identically in Node and the
//  browser. Returns { parts, solid, info }:
//    parts  - coloured pieces for a pretty assembly view (no pins)
//    solid  - authoritative geom3 for STL export (render_dispatcher result,
//             with cord hole, pins and chunking applied)
//    info   - dimensions + chunk grid
// ============================================================================

function buildPurifier(jscadModeling, P) {
  const { booleans, primitives, extrusions, transforms, hulls, expansions } = jscadModeling;
  const { union, subtract, intersect } = booleans;
  const { cuboid, cylinder, circle, rectangle, polygon } = primitives;
  const { extrudeLinear } = extrusions;
  const { translate, rotateX, rotateY, rotateZ } = transforms;
  const { hull } = hulls;
  const { offset } = expansions;
  const FN = P.fn || 48, D2R = Math.PI / 180;

  // ---- parameters ----------------------------------------------------------
  const X=P.X, Y=P.Y, fh=P.Filter_height, Rim=P.Rim, Filters=P.Filters;
  const Fan_diameter=P.Fan_diameter, Screw_holes=P.Screw_holes;
  const Fans={top:P.Fans_top,bottom:P.Fans_bottom,left:P.Fans_left,right:P.Fans_right};
  const Hex_grill=P.Hex_grill, Hex_size=P.Hex_size, Hex_spacing=P.Hex_spacing;
  const Slot_wall=P.Slot_wall, sc=P.Slot_clearance, Slot_end_margin=P.Slot_end_margin;
  const t=P.Wall_thickness, oft=P.Outside_flange_thickness, cf=P.Chamfer_size;
  const Corner_post_chamfer=P.Corner_post_chamfer;
  const Cord_d=P.Cord_hole_diameter, Cord_wall=P.Cord_hole_wall, Cord_side=P.Cord_hole_side, Cord_off=P.Cord_hole_corner_offset;
  const Pin_d=P.Pin_diameter, Pin_depth=P.Pin_hole_depth, Pin_spacing=P.Pin_spacing;
  const Bed_x=P.Bed_x, Bed_y=P.Bed_y, Bed_z=P.Bed_z;
  const Render_part=P.Render_part, Chunk_ix=P.Chunk_ix, Chunk_iy=P.Chunk_iy, Chunk_iz=P.Chunk_iz, Chunk_to_origin=P.Chunk_to_origin;

  // ---- derived -------------------------------------------------------------
  const fl=t, eps=0.05, frame_thickness=oft;
  const box_x=(Filters===4)?X+2*(oft+fh+t):X+2*t;
  const box_y=(Filters===4)?X+2*(oft+fh+t):Y+2*t;
  const h_box=(Filters===4)?(t+Y+oft):(Fan_diameter+2+2*frame_thickness+Filters*(fh+fl));
  const hw=h_box-2*frame_thickness;
  const bp_thk=t, tp_thk=oft, ofs=oft+fh+t;
  const air_x_min=ofs, air_x_max=box_x-ofs, air_y_min=ofs, air_y_max=box_y-ofs;

  const fan_body_depth=d=>d===120?25:d===140?27:d*0.19;
  const fan_hole_pitch=d=>d===120?105:d===140?125:d*0.85;
  const sp=fan_hole_pitch(Fan_diameter);

  const filter_z=idx=>(Filters===1)?h_box-frame_thickness-fh:(idx===0)?frame_thickness:h_box-frame_thickness-fh;
  const fan_corner_safe_min=()=>t+fan_body_depth(Fan_diameter)+Fan_diameter/2;
  const max_fans=L=>{const mc=fan_corner_safe_min(),s=Fan_diameter+10,span=L-2*mc;return span<0?0:Math.max(0,Math.floor(1+span/s));};
  const actual_fans=(n,L)=>{const m=max_fans(L);return(n<0||n>m)?m:n;};
  const fan_posy_local=hwl=>{const nat=(Filters===2)?hwl/2:(hwl-fh-fl)/2;return Math.min(nat,hwl-2*Cord_d-Fan_diameter/2);};
  const fan_positions=(n,L)=>{const na=actual_fans(n,L),mc=fan_corner_safe_min(),min_sp=Fan_diameter+10;
    const spread=na<=1?min_sp:(L-2*mc)/(na-1),spacing=Math.max(min_sp,spread);
    const total=na<=1?0:(na-1)*spacing,first=na===1?L/2:(L-total)/2;
    return Array.from({length:na},(_,i)=>first+i*spacing);};
  const top_fan_min_centre=()=>oft+fh+t+Fan_diameter/2;
  const top_fans_per_side=L=>{const mc=top_fan_min_centre(),s=Fan_diameter+10,span=L-2*mc;return span<0?0:Math.max(0,Math.floor(1+span/s));};
  const top_fan_positions=(n,L)=>{const mc=top_fan_min_centre(),s=Fan_diameter+10,total=n<=1?0:(n-1)*s,first=n===1?L/2:(L-total)/2;
    return n<=0?[]:Array.from({length:n},(_,i)=>first+i*s);};

  // ---- chunk grid ----------------------------------------------------------
  const n_chunks_x=()=>Math.max(1,Math.ceil(box_x/Bed_x));
  const n_chunks_y=()=>Math.max(1,Math.ceil(box_y/Bed_y));
  const n_chunks_z=()=>Math.max(1,Math.ceil(h_box/Bed_z));
  const chunk_size_x=()=>box_x/n_chunks_x();
  const chunk_size_y=()=>box_y/n_chunks_y();
  const chunk_size_z=()=>h_box/n_chunks_z();

  // ---- 2D primitives -------------------------------------------------------
  const sq=(w,h)=>rectangle({size:[w,h],center:[w/2,h/2]});
  const round2=(g,r)=>offset({delta:r,corners:'round',segments:FN},offset({delta:-r,corners:'round',segments:FN},g));
  function roundedRect(w,h,r){return round2(sq(w,h),r);}
  function filter_opening_2d(){const ow=box_x-2*Rim,oh=box_y-2*Rim;if(ow<=0||oh<=0)return null;
    return translate([Rim,Rim],roundedRect(ow,oh,Math.min(10,ow/2,oh/2)));}
  const grow=(g,e)=>offset({delta:e,corners:'round',segments:FN},g);
  // centred rounded rect with optional outward expand (tower openings)
  function tower_opening_2d(w,h,expand=0){if(w<=0||h<=0)return null;
    const r=Math.min(10,w/2,h/2);let g=translate([-w/2,-h/2],sq(w,h));g=round2(g,r);
    return expand?offset({delta:expand,corners:'round',segments:FN},g):g;}
  function hex_2d(s){const r=s/Math.sqrt(3),pts=[];for(let k=0;k<=5;k++){const a=(60*k+30)*D2R;pts.push([r*Math.cos(a),r*Math.sin(a)]);}return polygon({points:pts});}
  function hex_grill_2d(d,s,sp2){const px=s+sp2,py=(s+sp2)*Math.sqrt(3)/2,nc=Math.ceil(d/px)+2,nr=Math.ceil(d/py)+2,hx=[];
    for(let j=-nr;j<=nr;j++)for(let i=-nc;i<=nc;i++){const ox=(j%2===0)?0:px/2;hx.push(translate([i*px+ox,j*py],hex_2d(s)));}
    return intersect(circle({radius:(d-2*sp2)/2,segments:FN}),union(hx));}
  function fan_pattern_2d(){const grill=Hex_grill?hex_grill_2d(Fan_diameter-4,Hex_size,Hex_spacing):circle({radius:(Fan_diameter-4)/2,segments:FN});
    const delta=sp/2,holes=[];for(const dx of[-delta,delta])for(const dy of[-delta,delta])holes.push(translate([dx,dy],circle({radius:Screw_holes/2,segments:FN})));
    return union(grill,...holes);}

  // ---- 3D primitives -------------------------------------------------------
  function chamfered_prism(dx,dy,dz,c){if(c<=0)return translate([dx/2,dy/2,dz/2],cuboid({size:[dx,dy,dz]}));
    const cc=Math.min(c,dx/2-0.01,dy/2-0.01);
    return extrudeLinear({height:dz},polygon({points:[[cc,0],[dx-cc,0],[dx,cc],[dx,dy-cc],[dx-cc,dy],[cc,dy],[0,dy-cc],[0,cc]]}));}
  const slab=(g,z,h=0.01)=>translate([0,0,z],extrudeLinear({height:h},g));
  const box=(x,y,z,dx,dy,dz)=>translate([x,y,z],cuboid({size:[dx,dy,dz],center:[dx/2,dy/2,dz/2]}));

  function frame_panel(){const body=chamfered_prism(box_x,box_y,frame_thickness,cf);const op=filter_opening_2d();if(!op)return body;
    let cut;if(cf>0){cut=union(hull(slab(grow(op,cf),-0.5),slab(op,cf)),
      translate([0,0,cf],extrudeLinear({height:frame_thickness-2*cf},op)),
      hull(slab(op,frame_thickness-cf),slab(grow(op,cf),frame_thickness+0.5)));}
    else{cut=translate([0,0,-0.5],extrudeLinear({height:frame_thickness+1},op));}
    return subtract(body,cut);}
  const plate_panel=()=>chamfered_prism(box_x,box_y,frame_thickness,cf);
  function flange_panel(){const op=filter_opening_2d();const body=chamfered_prism(box_x,box_y,fl,cf);if(!op)return body;
    return subtract(body,translate([0,0,-0.5],extrudeLinear({height:fl+1},op)));}

  function wall(L,fans_n,with_slot){let w=chamfered_prism(L,t,hw,cf);const cuts=[];
    for(const fx of fan_positions(fans_n,L)){const fan=extrudeLinear({height:t+1},fan_pattern_2d());
      cuts.push(translate([fx,-0.5,fan_posy_local(hw)],rotateX(-90*D2R,fan)));}
    if(with_slot)for(let idx=0;idx<Filters;idx++){const zb=Math.max(0,filter_z(idx)-sc-frame_thickness);
      const zt=Math.min(hw,filter_z(idx)+fh+sc-frame_thickness);
      if(zt>zb)cuts.push(box(Slot_end_margin,-0.5,zb,L-2*Slot_end_margin,t+1,zt-zb));}
    return cuts.length?subtract(w,union(cuts)):w;}

  // ---- tower (Filters=4) ---------------------------------------------------
  function tower_chamfered_opening_cut(w,h,depth,chamfer){
    const O=(e)=>tower_opening_2d(w,h,e);
    if(chamfer>0&&depth>2*chamfer)return union(
      hull(slab(O(chamfer),0),slab(O(0),chamfer)),
      translate([0,0,chamfer],extrudeLinear({height:depth-2*chamfer},O(0))),
      hull(slab(O(0),depth-chamfer),slab(O(chamfer),depth-0.01)));
    return extrudeLinear({height:depth},O(0));}
  function tower_side_opening(side,depth_lo,depth_hi){const w=X-2*Rim,h=Y-2*Rim,depth=depth_hi-depth_lo,cz=bp_thk+Y/2;
    const cut=(ww,hh)=>tower_chamfered_opening_cut(ww,hh,depth,cf);
    if(side==='front')return translate([box_x/2,depth_lo+depth,cz],rotateX(90*D2R,cut(w,h)));
    if(side==='back') return translate([box_x/2,box_y-depth_lo-depth,cz],rotateX(-90*D2R,cut(w,h)));
    if(side==='left') return translate([depth_lo+depth,box_y/2,cz],rotateY(-90*D2R,cut(h,w)));
    if(side==='right')return translate([box_x-depth_lo-depth,box_y/2,cz],rotateY(90*D2R,cut(h,w)));}
  function tower_filter_pocket(side){const z_lo=bp_thk-eps,h=h_box-bp_thk-tp_thk+2*eps;
    if(side==='front')return box(ofs,oft,z_lo,box_x-2*ofs,fh,h);
    if(side==='back') return box(ofs,box_y-oft-fh,z_lo,box_x-2*ofs,fh,h);
    if(side==='left') return box(oft,ofs,z_lo,fh,box_y-2*ofs,h);
    if(side==='right')return box(box_x-oft-fh,ofs,z_lo,fh,box_y-2*ofs,h);}
  function tower_fan_grid(){const nx=top_fans_per_side(box_x),ny=top_fans_per_side(box_y);
    const z0=h_box-tp_thk-eps,h=tp_thk+2*eps,out=[];
    for(const cx of top_fan_positions(nx,box_x))for(const cy of top_fan_positions(ny,box_y))
      out.push(translate([cx,cy,z0],extrudeLinear({height:h},fan_pattern_2d())));
    return out;}
  function tower_filter_slots(){const z0=h_box-tp_thk,h=tp_thk+eps;return[
    box(ofs,oft,z0,X,fh,h),box(ofs,box_y-oft-fh,z0,X,fh,h),
    box(oft,ofs,z0,fh,X,h),box(box_x-oft-fh,ofs,z0,fh,X,h)];}
  function assembly_tower(){
    const cuts=[box(air_x_min,air_y_min,bp_thk-eps,air_x_max-air_x_min,air_y_max-air_y_min,h_box-bp_thk-tp_thk+2*eps)];
    for(const s of['front','back','left','right'])cuts.push(tower_filter_pocket(s));
    for(const s of['front','back','left','right'])cuts.push(tower_side_opening(s,-eps,oft+eps));
    for(const s of['front','back','left','right'])cuts.push(tower_side_opening(s,oft+fh-eps,ofs+eps));
    cuts.push(...tower_fan_grid(),...tower_filter_slots());
    return subtract(chamfered_prism(box_x,box_y,h_box,Corner_post_chamfer),union(cuts));}

  // ---- cord hole -----------------------------------------------------------
  function cord_hole_cylinder(){if(Cord_d<=0||Cord_wall==='none')return null;
    if(Filters===4){const off=Math.max(Cord_d/2+2,Cord_off);
      const cx=((Cord_wall==='right')||((Cord_wall==='front'||Cord_wall==='back')&&Cord_side==='right'))?air_x_max-off:air_x_min+off;
      const cy=((Cord_wall==='back') ||((Cord_wall==='left' ||Cord_wall==='right')&&Cord_side==='right'))?air_y_max-off:air_y_min+off;
      return translate([cx,cy,h_box-tp_thk-eps],cylinder({radius:Cord_d/2,height:tp_thk+2*eps,segments:FN,center:[0,0,(tp_thk+2*eps)/2]}));}
    const cz=h_box/2,off=Math.max(Cord_d/2+t+1,Cord_off);
    const along=L=>Cord_side==='center'?L/2:Cord_side==='left'?off:L-off;
    const cyl=()=>cylinder({radius:Cord_d/2,height:t+1,segments:FN,center:[0,0,(t+1)/2]});
    if(Cord_wall==='front')return translate([along(box_x),-0.5,cz],rotateX(-90*D2R,cyl()));
    if(Cord_wall==='back') return translate([along(box_x),box_y+0.5,cz],rotateX(90*D2R,cyl()));
    if(Cord_wall==='left') return translate([-0.5,along(box_y),cz],rotateY(90*D2R,cyl()));
    if(Cord_wall==='right')return translate([box_x+0.5,along(box_y),cz],rotateY(-90*D2R,cyl()));
    return null;}

  // ---- alignment pins ------------------------------------------------------
  const rim_positions=(lo,hi,s)=>{const w=hi-lo,n=(w<=0)?0:Math.max(1,Math.floor(w/s)),step=n>0?w/n:0;
    return n===0?[]:Array.from({length:n},(_,i)=>lo+(i+0.5)*step);};
  const pinX=(x,y,z,len)=>translate([x,y,z],rotateY(90*D2R,cylinder({radius:Pin_d/2,height:len,segments:FN,center:[0,0,len/2]})));
  const pinY=(x,y,z,len)=>translate([x,y,z],rotateX(-90*D2R,cylinder({radius:Pin_d/2,height:len,segments:FN,center:[0,0,len/2]})));
  const pinZ=(x,y,z,len)=>translate([x,y,z],cylinder({radius:Pin_d/2,height:len,segments:FN,center:[0,0,len/2]}));

  function fan_body_zones(){const out=[];
    const one=(L,fans_n,xf,yf,rotZ)=>{for(const fx of fan_positions(fans_n,L)){
      let c=translate([fx,-1,fan_posy_local(hw)],rotateX(-90*D2R,cylinder({radius:Fan_diameter/2,height:t+2,segments:FN,center:[0,0,(t+2)/2]})));
      c=rotateZ(rotZ*D2R,c);c=translate([xf,yf,frame_thickness],c);out.push(c);}};
    one(box_x,Fans.top,0,0,0);one(box_x,Fans.bottom,box_x,box_y,180);
    one(box_y,Fans.left,0,box_y,-90);one(box_y,Fans.right,box_x,0,90);
    return out.length?union(out):null;}

  function frame_midlines_opening(){const a=[h_box-frame_thickness/2];if(Filters===2)a.push(frame_thickness/2);
    if(Filters===1)a.push(filter_z(0)-fl+fl/2);else{a.push(filter_z(0)+fh+fl/2,filter_z(1)-fl+fl/2);}return a;}
  const plate_midlines_solid=()=>(Filters===1)?[frame_thickness/2]:[];

  function pin_candidates_horizontal(){const nx=n_chunks_x(),ny=n_chunks_y(),nz=n_chunks_z();
    const csx=chunk_size_x(),csy=chunk_size_y(),csz=chunk_size_z(),len=2*Pin_depth,s=Pin_spacing,out=[];
    if(nx>1)for(let i=1;i<nx;i++){const xs=i*csx;
      for(const wy of[t/2,box_y-t/2])for(const gz of rim_positions(frame_thickness,h_box-frame_thickness,s))out.push(pinX(xs-Pin_depth,wy,gz,len));
      for(const fz of frame_midlines_opening()){
        for(const gy of rim_positions(t,Rim,s))out.push(pinX(xs-Pin_depth,gy,fz,len));
        for(const gy of rim_positions(box_y-Rim,box_y-t,s))out.push(pinX(xs-Pin_depth,gy,fz,len));}
      for(const fz of plate_midlines_solid())for(const gy of rim_positions(t,box_y-t,s))out.push(pinX(xs-Pin_depth,gy,fz,len));}
    if(ny>1)for(let j=1;j<ny;j++){const ys=j*csy;
      for(const wx of[t/2,box_x-t/2])for(const gz of rim_positions(frame_thickness,h_box-frame_thickness,s))out.push(pinY(wx,ys-Pin_depth,gz,len));
      for(const fz of frame_midlines_opening()){
        for(const gx of rim_positions(t,Rim,s))out.push(pinY(gx,ys-Pin_depth,fz,len));
        for(const gx of rim_positions(box_x-Rim,box_x-t,s))out.push(pinY(gx,ys-Pin_depth,fz,len));}
      for(const fz of plate_midlines_solid())for(const gx of rim_positions(t,box_x-t,s))out.push(pinY(gx,ys-Pin_depth,fz,len));}
    if(nz>1)for(let k=1;k<nz;k++){const zs=k*csz;
      for(const wy of[t/2,box_y-t/2])for(const gx of rim_positions(0,box_x,s))out.push(pinZ(gx,wy,zs-Pin_depth,len));
      for(const wx of[t/2,box_x-t/2])for(const gy of rim_positions(t,box_y-t,s))out.push(pinZ(wx,gy,zs-Pin_depth,len));}
    return out;}

  function pin_candidates_tower(){const nx=n_chunks_x(),ny=n_chunks_y(),nz=n_chunks_z();
    const csx=chunk_size_x(),csy=chunk_size_y(),csz=chunk_size_z(),len=2*Pin_depth,s=Pin_spacing;
    const wz_lo=bp_thk,wz_hi=h_box-tp_thk,out=[];
    if(nx>1)for(let i=1;i<nx;i++){const xs=i*csx;
      for(const wy of[oft/2,box_y-oft/2])for(const gz of rim_positions(wz_lo,wz_hi,s))out.push(pinX(xs-Pin_depth,wy,gz,len));
      for(const wy of[oft+fh+t/2,box_y-oft-fh-t/2])for(const gz of rim_positions(wz_lo,wz_hi,s))out.push(pinX(xs-Pin_depth,wy,gz,len));
      for(const gy of rim_positions(t,box_y-t,s))out.push(pinX(xs-Pin_depth,gy,bp_thk/2,len));
      for(const gy of rim_positions(oft,ofs,s))out.push(pinX(xs-Pin_depth,gy,h_box-tp_thk/2,len));
      for(const gy of rim_positions(box_y-ofs,box_y-oft,s))out.push(pinX(xs-Pin_depth,gy,h_box-tp_thk/2,len));}
    if(ny>1)for(let j=1;j<ny;j++){const ys=j*csy;
      for(const wx of[oft/2,box_x-oft/2])for(const gz of rim_positions(wz_lo,wz_hi,s))out.push(pinY(wx,ys-Pin_depth,gz,len));
      for(const wx of[oft+fh+t/2,box_x-oft-fh-t/2])for(const gz of rim_positions(wz_lo,wz_hi,s))out.push(pinY(wx,ys-Pin_depth,gz,len));
      for(const gx of rim_positions(t,box_x-t,s))out.push(pinY(gx,ys-Pin_depth,bp_thk/2,len));
      for(const gx of rim_positions(oft,ofs,s))out.push(pinY(gx,ys-Pin_depth,h_box-tp_thk/2,len));
      for(const gx of rim_positions(box_x-ofs,box_x-oft,s))out.push(pinY(gx,ys-Pin_depth,h_box-tp_thk/2,len));}
    if(nz>1)for(let k=1;k<nz;k++){const zs=k*csz;
      for(const wy of[oft/2,box_y-oft/2])for(const gx of rim_positions(0,box_x,s))out.push(pinZ(gx,wy,zs-Pin_depth,len));
      for(const wx of[oft/2,box_x-oft/2])for(const gy of rim_positions(oft,box_y-oft,s))out.push(pinZ(wx,gy,zs-Pin_depth,len));
      for(const wy of[oft+fh+t/2,box_y-oft-fh-t/2])for(const gx of rim_positions(ofs,box_x-ofs,s))out.push(pinZ(gx,wy,zs-Pin_depth,len));
      for(const wx of[oft+fh+t/2,box_x-oft-fh-t/2])for(const gy of rim_positions(ofs,box_y-ofs,s))out.push(pinZ(wx,gy,zs-Pin_depth,len));
      const pin_xy=ofs-t;for(const cx of[pin_xy,box_x-pin_xy])for(const cy of[pin_xy,box_y-pin_xy])out.push(pinZ(cx,cy,zs-Pin_depth,len));}
    return out;}

  function pin_holes(){const multi=n_chunks_x()>1||n_chunks_y()>1||n_chunks_z()>1;
    if(!(Pin_d>0&&Pin_depth>0&&Pin_spacing>0&&multi))return null;
    const cand=(Filters===4)?pin_candidates_tower():pin_candidates_horizontal();
    if(!cand.length)return null;
    let pins=union(cand);const zones=fan_body_zones();
    return zones?subtract(pins,zones):pins;}

  // ---- assembly + final ----------------------------------------------------
  const parts=[];
  function assembly_horizontal_parts(){
    parts.push({geom:Filters===2?frame_panel():plate_panel(),color:[0.86,0.86,0.86]});
    parts.push({geom:translate([0,0,h_box-frame_thickness],frame_panel()),color:[0.86,0.86,0.86]});
    if(Filters===1){parts.push({geom:translate([0,0,filter_z(0)-fl],flange_panel()),color:[0.41,0.41,0.41]});}
    else{parts.push({geom:translate([0,0,filter_z(0)+fh],flange_panel()),color:[0.41,0.41,0.41]});
         parts.push({geom:translate([0,0,filter_z(1)-fl],flange_panel()),color:[0.41,0.41,0.41]});}
    const wc=[0.69,0.77,0.87];
    parts.push({geom:translate([0,0,frame_thickness],wall(box_x,Fans.top,Slot_wall==='top')),color:wc});
    parts.push({geom:translate([box_x,box_y,frame_thickness],rotateZ(180*D2R,wall(box_x,Fans.bottom,Slot_wall==='bottom'))),color:wc});
    parts.push({geom:translate([0,box_y,frame_thickness],rotateZ(-90*D2R,wall(box_y,Fans.left,Slot_wall==='left'))),color:wc});
    parts.push({geom:translate([box_x,0,frame_thickness],rotateZ(90*D2R,wall(box_y,Fans.right,Slot_wall==='right'))),color:wc});
  }
  let assembly;
  if(Filters===4){assembly=assembly_tower();parts.push({geom:assembly,color:[0.86,0.86,0.86]});}
  else{assembly_horizontal_parts();assembly=union(parts.map(p=>p.geom));}

  // final_model = assembly - (cord + pins)
  let final_model=assembly;
  const subs=[];const cord=cord_hole_cylinder();if(cord)subs.push(cord);
  const pins=pin_holes();if(pins)subs.push(pins);
  if(subs.length)final_model=subtract(assembly,union(subs));

  // render_dispatcher: assembly or one print chunk
  let solid=final_model;
  if(Render_part==='chunk'){const nx=n_chunks_x(),ny=n_chunks_y(),nz=n_chunks_z();
    const six=Math.max(0,Math.min(Chunk_ix,nx-1)),siy=Math.max(0,Math.min(Chunk_iy,ny-1)),siz=Math.max(0,Math.min(Chunk_iz,nz-1));
    const csx=chunk_size_x(),csy=chunk_size_y(),csz=chunk_size_z();
    const cx=six*csx,cy=siy*csy,cz=siz*csz;
    let chunk=intersect(final_model,box(cx,cy,cz,csx,csy,csz));
    if(Chunk_to_origin)chunk=translate([-cx,-cy,-cz],chunk);
    solid=chunk;}

  return {parts:(Render_part==='chunk')?null:parts, solid,
    info:{box_x,box_y,h_box,Filters,
      chunks:[n_chunks_x(),n_chunks_y(),n_chunks_z()],
      chunkSize:[+chunk_size_x().toFixed(1),+chunk_size_y().toFixed(1),+chunk_size_z().toFixed(1)]}};
}

if (typeof module !== 'undefined' && module.exports) module.exports = { buildPurifier };
if (typeof window !== 'undefined') window.buildPurifier = buildPurifier;
