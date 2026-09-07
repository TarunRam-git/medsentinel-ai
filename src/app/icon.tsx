import { ImageResponse } from "next/og";
export const size={width:32,height:32};
export const contentType="image/png";
export default function Icon(){return new ImageResponse(<div style={{display:"flex",width:"100%",height:"100%",alignItems:"center",justifyContent:"center",background:"#087f79",color:"white",borderRadius:8,fontSize:22,fontWeight:700}}>M</div>,size);}
