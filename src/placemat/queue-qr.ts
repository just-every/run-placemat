import qrcode from 'qrcode-generator'
/** A real, locally generated QR; no guest/contact data reaches a QR provider. */
export function queueQr(origin:string,serviceId:string){
 const link=new URL('/queue',origin);link.searchParams.set('serviceId',serviceId)
 const code=qrcode(0,'M');code.addData(link.href,'Byte');code.make()
 return code.createSvgTag({cellSize:4,margin:16,scalable:true})
}
