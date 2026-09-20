import ExcelJS from 'exceljs';
import { costs, sourceNames, type Listing } from '@rent/shared';
export async function exportWorkbook(listings: Listing[], months:number) {
  const book = new ExcelJS.Workbook(); book.creator='Место'; book.created=new Date();
  const sheet=book.addWorksheet('Квартиры',{views:[{state:'frozen',ySplit:1}]});
  sheet.columns=[
    ['Квартира',36],['Источник',24],['Адрес',48],['Ссылка',48],['Аренда / мес, ₽',20],['ЖКУ / мес, ₽',18],['Залог, ₽',18],['Комиссия',16],['Тип комиссии',18],['Прочие при въезде, ₽',24],['Комиссия, ₽',18],['В месяц, ₽',18],['На въезд, ₽',18],['Срок, мес',14],['Расходы за срок, ₽',24],['С учетом залога, ₽',24],['В среднем / мес, ₽',24],['Условия',28],['Заметка',45],['Фото (ссылка)',50],['Данные',22]
  ].map(([header,width])=>({header:String(header),width:Number(width)}));
  listings.forEach((l,i)=>{
    const r=i+2,c=costs(l,months);
    sheet.addRow([l.title,sourceNames[l.source],l.address,l.url,l.rent,l.utilities,l.deposit,l.commission,l.commissionType==='percent'?'%':'₽',l.otherCosts,
      {formula:`IF(I${r}="%",E${r}*H${r}/100,H${r})`,result:c.fee},
      {formula:`E${r}+F${r}`,result:c.monthly},{formula:`L${r}+G${r}+K${r}+J${r}`,result:c.moveIn},months,
      {formula:`L${r}*N${r}+K${r}+J${r}`,result:c.total},{formula:`O${r}+G${r}`,result:c.cashTotal},{formula:`O${r}/N${r}`,result:c.average},
      c.incomplete?'Неполные: уточните суммы':'Все расходы указаны',l.notes,l.photos[0] || '',l.demo?'ДЕМО, вымышленные':'Добавлено пользователем']);
    if(l.url) sheet.getCell(r,4).value={text:l.url,hyperlink:l.url};
    if(l.photos[0]) sheet.getCell(r,20).value={text:'Открыть фото',hyperlink:l.photos[0]};
    [5,6,7,10,11,12,13,15,16,17].forEach(col=>sheet.getCell(r,col).numFmt='#,##0.00');
    sheet.getRow(r).height=32;
    if(i%2===0) sheet.getRow(r).eachCell(cell=>cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF2F5F1'}});
  });
  sheet.getRow(1).height=36; sheet.getRow(1).eachCell(c=>{c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF26473C'}};c.font={bold:true,color:{argb:'FFFFFFFF'}};c.alignment={vertical:'middle',wrapText:true};});
  sheet.autoFilter={from:'A1',to:`U${listings.length+1}`};
  const guide=book.addWorksheet('Как считать');
  guide.columns=[{width:35},{width:105}];
  guide.addRows([
    ['Место · расчет аренды','Все суммы в рублях. Дата экспорта: '+new Date().toLocaleDateString('ru-RU')],
    ['На въезд','Первый месяц аренды + ЖКУ + залог + комиссия + прочие разовые расходы.'],
    ['Расходы за срок','Аренда и ЖКУ × число месяцев + комиссия + прочие расходы. Возвратный залог исключен.'],
    ['С учетом залога','Все денежные выплаты за срок до возврата залога.'],
    ['Неизвестные расходы','Пустая ячейка означает «не указано», а не ноль. Формулы считают нижнюю оценку; уточните суммы.'],
    ['ЖКУ','Указывайте свою оценку, включая счетчики. Неизвестные суммы не подставляются автоматически.'],
    ['Фотографии','Ссылки на первое фото. Изображения не встроены в файл и могут быть недоступны у источника.'],
    ['Демонстрационные данные','Строки с пометкой ДЕМО не являются реальными объявлениями.'],
  ]); guide.getColumn(2).alignment={wrapText:true,vertical:'middle'}; guide.eachRow(r=>r.height=45);
  return book.xlsx.writeBuffer();
}
