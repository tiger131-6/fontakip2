var ROOTKATEGORIID = 0;
var ROOTKATEGORIID_1 = 0;
var ROOTKATEGORIID_2 = 0;

function trim(s, c) {
    if (c === "]") c = "\\]";
    if (c === "^") c = "\\^";
    if (c === "\\") c = "\\\\";
    return s.replace(new RegExp(
        "^[" + c + "]+|[" + c + "]+$", "g"
    ), "");
}

function GetServisKey() {
    var token = $('input[name="__RequestVerificationToken"]').val();

    var options = {
        type: "POST",
        url: appUrl + "/Uye/GetServisKey",
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        headers: {
            "X-CSRF-Token": token  // Or "__RequestVerificationToken" if you prefer
        },
        async: false,
        error: function (x, y, z) {
        }
    };

    var sessionKey = "";
    $.ajax(options).done(

        function (data) {
            sessionKey = data;
        }
    );

    return sessionKey;
}

function VeriTarihiGetir(kod, successFunc) {

    var options = {
        type: "POST",
        cache: false,
        url: Servisurl + '/VeriTarihi',
        contentType: "application/json; charset=utf-8",
        data: JSON.stringify({ Kod: kod }),
        dataType: "json",
        success: function (data) {

            successFunc(data);
        },
        error: function (x, y, z) {
            //alert('Hata: ' + z + ' ' + x.status);

        }
    };
    $.ajax(options);


}

function raporTabloCalc(param) {

    var options = {
        type: "POST",
        cache: false,
        url: Servisurl + '/RaporTabloHesapla',
        data: JSON.stringify({ RaporParams: param }),
        contentType: "application/json; charset=utf-8",
        dataType: "json"
    }

    return webService(options);

}

function FonVeriTarih(kod, DegerlemeTarih) {

    var options = {
        type: "GET",
        url: Servisurl + "/FonVeriTarihi?Kod=" + kod + "&DegerlemeTarihi=" + DegerlemeTarih,
        contentType: "application/json; charset=utf-8",
        dataType: "json"
    };
    return webService(options);
};

function FonIlkVeriTarihi(kod, DegerlemeTarih) {

    var options = {
        type: "GET",
        url: Servisurl + "/FonIlkVeriTarihi?Kod=" + kod + "&DegerlemeTarihi=" + DegerlemeTarih,
        contentType: "application/json; charset=utf-8",
        dataType: "json"
    };
    return webService(options);
};


function FonAnaKategori(anatipId) {

    var options = {
        type: "GET",
        url: Servisurl + "/FonAnaKategori?AnatipId=" + anatipId,
        contentType: "application/json; charset=utf-8",
        dataType: "json"

    };
    return webService(options);
};
function FonOlcutDetay(kod, tarih) {

    var options = {
        type: "POST",
        cache: false,
        url: Servisurl + '/FonOlcutGuncelDetay?FonKod=' + kod + '&Tarih=' + tarih,
        contentType: "application/json; charset=utf-8",
        dataType: "json"
    }

    return webService(options);

}
function numericFormatClassName(format) {
    if (format && format != "") {
        if (format.indexOf("#") != -1 || format.indexOf("0.") != -1) {
            return "dt-right";
        }
        //else if (format.indexOf("/") = !-1) {
        //    return "dt-center";

        //}
    }

    return "";
}

function FonKategoriAdet(data, fonAd) {

    var fon = new Object();

    for (var i = 0; i < data.length; i++) {
        if (data[i].o.Ad == fonAd) {
            fon.oKazandiranAdet = data[i].o.FonKategoriEndeksKazandiranFonAdet;
            fon.sKazandiranAdet = data[i].s.FonKategoriEndeksKazandiranFonAdet;
            fon.oKaybettirenAdet = data[i].o.FonKategoriEndeksKaybettirenFonAdet;
            fon.sKaybettirenAdet = data[i].s.FonKategoriEndeksKaybettirenFonAdet;

            return fon;
        }
    }

}

function FonKategoriAdetYeni(data) {

    var fon = new Object();

    for (var i = 0; i < data.length; i++) {

        fon.oKazandiranAdet = (isNaN(fon.oKazandiranAdet) ? 0 : fon.oKazandiranAdet) + data[i].o.FonKategoriEndeksKazandiranFonAdet;
        fon.oKaybettirenAdet = (isNaN(fon.oKaybettirenAdet) ? 0 : fon.oKaybettirenAdet) + data[i].o.FonKategoriEndeksKaybettirenFonAdet;
    }

    fon.sKazandiranAdet = fon.oKazandiranAdet.toString();
    fon.sKaybettirenAdet = fon.oKaybettirenAdet.toString();

    return fon;
}

//TABLO YÜKLEME FONKSİYONLARI, BAŞLANGIÇ

function tabloYukleJS_V2(elm, tablo, options) {

    var aa_Sorting = [];
    var searchBuilder = undefined;
    var colReorder = undefined;
    //var dom = "lfrtip";
    // var dom = '<"left"f><"right"B>rtip';


    if (typeof options !== "undefined") {

        if (typeof options.aa_Sorting !== "undefined") {
            aa_Sorting = options.aa_Sorting;
        }

        if (typeof options.searchBuilder !== "undefined") {
            searchBuilder = options.searchBuilder;
        }

        //if (typeof options.dom == "string") {
        //    dom = options.dom;
        //}
        //if (typeof options.fixedColumns !== "undefined") {
        //    fixedColumns = options.fixedColumns;
        //}
        if (typeof options.colReorder !== undefined) {
            colReorder = options.colReorder;
        }
    }

    let columns = [];

    for (var i = 0; i < tablo.BaslikListe.length; i++) {

        var bs = tablo.BaslikListe[i];
        var cs = bs.CustomData;
        let isVisible = true;
        let toolTipAlan = "";
        if (typeof cs != "undefined") {
            if (typeof cs.IsVisible == "boolean") {
                isVisible = cs.IsVisible;
            };
            if (typeof cs.ToolTip == "string") {
                toolTipAlan = cs.ToolTip;
            };

        }

        //PropertyName olabilsin ["Kod","asc"] bu durumda index'e dönüştür  
        if (aa_Sorting.length == 2) {

            if (aa_Sorting[0] == tablo.BaslikListe[i].PropertyName) {

                aa_Sorting[0] = i;
            }
        }

        if (isVisible) {


            if (tablo.BaslikListe[i].PropertyName == 'Kod') {

                columns.push({
                    className: "dt-left",
                    title: tablo.BaslikListe[i].Baslik,
                    Baslik: tablo.BaslikListe[i],
                    ToolTipAlan: toolTipAlan,
                    data: {
                        _: "s." + tablo.BaslikListe[i].PropertyName,
                        sort: "o." + tablo.BaslikListe[i].PropertyName
                    },
                    render: function (data, type, row, meta) {

                        if (type == "display") {
                            var b = meta.settings.aoColumns[meta.col];

                            var alink = $("<a target='_blank'/>");
                            alink.attr("href", appUrl + "/FonProfilleri/FonAnaliz/" + data);
                            if (b.ToolTipAlan !== "") {
                                alink.attr("title", row.s[b.ToolTipAlan]);
                            }
                            alink.html(data);
                            var txt = alink.prop("outerHTML");
                            return txt;
                        }
                        else {
                            return data;
                        }
                    }
                });
            } else {

                columns.push({
                    className: tablo.BaslikListe[i].TextAlign === "Right" ? "dt-right" : (tablo.BaslikListe[i].TextAlign == "Center" ? "dt-center" : "dt-left"),
                    title: tablo.BaslikListe[i].Baslik,
                    Baslik: tablo.BaslikListe[i],
                    searchBuilderType: tablo.BaslikListe[i].searchBuilderType,
                    visible: typeof tablo.BaslikListe[i].Visible === "boolean" ? tablo.BaslikListe[i].Visible : true,
                    sType: "nullable",
                    data: {
                        _: "s." + tablo.BaslikListe[i].PropertyName,
                        sort: "o." + tablo.BaslikListe[i].PropertyName
                    },
                    bSortable: true,
                    render: function (data, type, full, meta) {

                        var colmunProp = meta.settings.aoColumns[meta.col];
                        if (data !== null) {

                            switch (type) {

                                case "display":
                                    break;

                                case "export":
                                    let jdata = full.o[colmunProp.Baslik.PropertyName];

                                    if (typeof jdata == "number" && colmunProp.Baslik.VeriFormat !== "") {
                                        data = jdata;
                                    }
                                    break;
                                case "filter":
                                    data = full.o[colmunProp.Baslik.PropertyName];
                                    break;
                                case "sort":
                                    data = full.o[colmunProp.Baslik.PropertyName];
                                    break;

                                default:
                                    data = full.o[colmunProp.Baslik.PropertyName];
                                    break;
                            }
                        }
                        return data;
                    },

                    "createdCell": function (td, cellData, rowData, row, col) {
                        let jdata = cellData;
                        if (jdata !== null && jdata !== "") {

                            var colmunProp = columns[col];
                            var cs = colmunProp.Baslik.CustomData;
                            if (typeof cs !== "undefined") {

                                var keys = Object.keys(cs);
                                for (var key in keys) {
                                    var keyName = keys[key];
                                    var value = cs[keyName];

                                    if (value === jdata) {
                                        if (keyName.startsWith("Artan")) {

                                            $(td).addClass('pozitif')
                                        } else if (keyName.startsWith("Azalan")) {

                                            $(td).addClass('negatif')
                                        }

                                        break;
                                    }
                                }

                            }


                        }
                    }
                });
            }
        }
    };
    //fnIsDataTable
    if ($.fn.DataTable.isDataTable($(elm))) {
        var tbl = $(elm).DataTable();
        tbl.clear().destroy(false);

    }

    $(elm).find('tr').remove();//geçici olarak


    var buttons = [];


    buttons.push({
        text: 'Excele Aktar',
        extend: 'excelHtml5',
        exportOptions: { orthogonal: 'export' },
        autoFilter: true

    });


    var layout = {}

    if (searchBuilder) {
        layout.top1Start = {
            buttons:
                [
                    { extend: 'searchBuilder', text: 'Arama', config: searchBuilder, collectionLayout: 'fixed', }
                ]
        };
    }

    layout.top1End = {

        buttons: [

            {
                extend: 'excelHtml5',
                text: 'Excel',
                exportOptions: {
                    orthogonal: 'export',
                    display: "excel"
                },
                customize: function (xlsx) {
                    var sheet = xlsx.xl.worksheets['sheet1.xml'];

                    for (var i = 0; i < columns.length; i++) {
                        var col = columns[i];
                        if (col.Baslik.Baslik === "Kod") {
                            sheet.querySelectorAll('row c:nth-child(' + (i + 1) + ')').forEach((el, a, b, c, d, e) => {
                                el.setAttribute('s', '2');//bold
                            });
                        }
                        else if (typeof col.Baslik.VeriFormat === "string" && col.Baslik.VeriFormat.indexOf("#") !== -1) {
                            sheet.querySelectorAll('row c:nth-child(' + (i + 1) + ')').forEach((el, a, b, c, d, e) => {
                                if (a > 0) {
                                    el.setAttribute('s', '64');//binlik ayraç
                                }

                            });
                        }
                    }

                }
            }
        ]

    }

    return new DataTable(elm, {
        "data": tablo.JSVeriler,
        "bDestroy": true,
        "responsive": false,//responsive olmasın
        "bSort": true,
        "aaSorting": aa_Sorting,
        colReorder: colReorder,
        //   dom: dom,
        columns: columns,
        "lengthMenu": [[10, 20, 30, 50, 100, -1], [10, 20, 30, 50, 100, "Tümü"]],
        pageLength: 50,
        "autoWidth": false,
        paging: true,
        layout: layout

    });



}

 function raporTabloYukle(elm, jdata, options) {

        if (!jdata) {
            $(elm).empty();
            return;
        }

        var detaylink = null;
        var siralananSutun = null;
        var ArtanAzalan = "asc";
        var aa_Sorting = [];
        var siralananSutunNo;
        var grupSatirVar = false;
        var grupSatirAlt = true;
        var renkliSutunlar = [];
        var toplamSatir = false;
        var footerOlustur = null;
        var isYuzdeRenkli = null;
        var isFonKarsilastirmaGoster = null;

        if (options) {

            if (options.isFonKarsilastirmaGoster) {
                isFonKarsilastirmaGoster = options.isFonKarsilastirmaGoster;
            }

            if (options.isYuzdeRenkli) {
                isYuzdeRenkli = true;
            }

            if (options.grupsatir != undefined) {
                grupSatirVar = options.grupsatir;
                if (options.grupalt != undefined) {
                    grupSatirAlt = options.grupalt;
                }
            }
            if (options.detaylink != undefined) {
                detaylink = options.detaylink;
            }
            if (options.siralananSutun != undefined) {
                siralananSutun = options.siralananSutun;
            }
            if (options.artanAzalan != undefined) {
                ArtanAzalan = options.artanAzalan;
            }
            if (options.renkliSutunlar != undefined) {
                renkliSutunlar = options.renkliSutunlar;
            }
            if (options.toplamSatir != undefined) {
                toplamSatir = options.toplamSatir;
            }
        }


        var tablo = jdata.TabloListesi[0];
        var footerData = null;

        if (toplamSatir) {
            //footer datası ilgili verilerden alınır.
            footerData = tablo.JSVeriler[tablo.JSVeriler.length - 1];
            //tabloya yüklenecek değerlerden toplam datası çıkarılır
            tablo.JSVeriler.length = tablo.JSVeriler.length - 1
        }
        var columns = [];

        var tabloFooterElement = "";
        var tabloFooterRowElement = "";

        let kodKarsilastirmaListe = [];
        var kodKarsilastirma = GetHashParamValue("fonlar");
        if (kodKarsilastirma !== "") {

            kodKarsilastirmaListe = kodKarsilastirma.split(",");
        }


     for (var i = 0; i < tablo.BaslikListe.length; i++) {
         if (tablo.BaslikListe[i].Baslik == "Fonlar") {
             tablo.BaslikListe[i].Baslik = tablo.BaslikListe[i].Baslik.replace("Fonlar", "Ad");
         }
            columns.push({
                title: tablo.BaslikListe[i].Baslik == "FonRepo %" ? tablo.BaslikListe[i].Baslik.replace("FonRepo %", "Fon Repo %") : tablo.BaslikListe[i].Baslik,
                tabloPropertyName: tablo.BaslikListe[i].PropertyName,
                data: {
                    _: "s." + tablo.BaslikListe[i].PropertyName,
                    // sort: "o." + tablo.BaslikListe[i].PropertyName
                    "sort": function (data, type, row, meta) {

                        if (type == "sort" && columns[meta.col].tabloPropertyName == 'Kod' && isFonKarsilastirmaGoster && data.length == 3) {

                            var kodSecili = kodKarsilastirmaListe.indexOf(full.s.Kod) != -1;
                            if (kodSecili) {

                                return " " + data;
                            }

                        }

                        return data.o[columns[meta.col].tabloPropertyName];
                    },
                },
                bSortable: true,
                //sType: "numeric",
                sType: "nullable",
                className: (tablo.BaslikListe[i].PropertyName == "Kod" ? "text-nowrap " : (tablo.BaslikListe[i].PropertyName == "_FonBilgiRiskDegeri" ? "dt-right" : ""))+ (numericFormatClassName(tablo.BaslikListe[i].VeriFormat)),


                render: function (data, type, full, meta) {

                    if (type == 'display') {

                        if (detaylink && (columns[meta.col].tabloPropertyName == 'Kod' || columns[meta.col].tabloPropertyName == 'Ad' || columns[meta.col].tabloPropertyName == 'Fon' || columns[meta.col].tabloPropertyName == 'Fonlar') || columns[meta.col].tabloPropertyName == 'FonAdi') {

                            if (tablo.JSVeriler[meta.row].s.Kod != undefined) {

                                if (grupSatirVar && ((!grupSatirAlt && meta.row == 0) || (grupSatirAlt && meta.row == tablo.JSVeriler.length - 1))) {
                                    //     data = YuzdeselIconHisse(full, tablo.BaslikListe[meta.col].PropertyName);
                                }
                                else {

                                    if (isFonKarsilastirmaGoster && data.length == 3) {

                                        var kodSecili = kodKarsilastirmaListe.indexOf(full.s.Kod) != -1;

                                        data = "<a href='" + appUrl + "/" + detaylink + "/" + tablo.JSVeriler[meta.row].s.Kod.replace(/\./g, "").replace(/ /g, "") + "'>" + data + "</a>" + "&nbsp;<input data-kod='" + full.s.Kod + "' type='checkbox' class='karsilastirma'  " + (kodSecili ? " checked " : "") + " onchange='OnKarsilastirChecked(this);'  />";
                                    }
                                    else {
                                        //link,Kod alanı içerisindeki nokta ve boşluklar silinerek oluşturuluyor.
                                        data = "<a href='" + appUrl + "/" + detaylink + "/" + tablo.JSVeriler[meta.row].s.Kod.replace(/\./g, "").replace(/ /g, "") + "'>" + data + "</a>";
                                    }


                                }
                            }
                            //else {
                            //    data = YuzdeselIconHisse(full, tablo.BaslikListe[meta.col].PropertyName);
                            //}


                        }

                        if ((isYuzdeRenkli && columns[meta.col].title.includes("%")) || renkliSutunlar.indexOf(meta.col) >= 0) {
                            /*"YatirimFonlari/FonKarsilastir/Karsilastir/FonOlcutGetiri" ve "YatirimFonlari/FonGetirileri/Getiri" sayfaları için eklendi.*/
                            if (tablo.BaslikListe[meta.col].PropertyName != "_FonBilgiRiskDegeri" &&
                                tablo.BaslikListe[meta.col].PropertyName != "_FonYonetimGideri" &&
                                tablo.BaslikListe[meta.col].PropertyName != "p1") {
                                data = YuzdeselIconHisse(full, tablo.BaslikListe[meta.col].PropertyName);
                            }
                            
                        }
                    }
                    else {


                        if (type == "sort" && columns[meta.col].tabloPropertyName == 'Kod' && isFonKarsilastirmaGoster && data.length == 3) {

                            var kodSecili = kodKarsilastirmaListe.indexOf(full.s.Kod) != -1;
                            if (kodSecili) {

                                return " " + data;
                            }

                        }

                        data = full.o[columns[meta.col].tabloPropertyName];
                    }

                    return data;

                }
            });

            if (columns[i].tabloPropertyName == siralananSutun) {
                siralananSutunNo = i;

                aa_Sorting = [[siralananSutunNo, ArtanAzalan]];
            }
            //Tabloda toplam satırı var ise
            if (toplamSatir) {

                var footerID = elm.replace('#', '') + "Footer";

                //İlk footer ve satır elementi oluşturulur.
                if (i == 0) {
                    tabloFooterElement = $("<tfoot/ id='" + footerID + "'>");
                    tabloFooterRowElement = $("<tr/>");
                }
                //satır elementine ilgili sütunlar eklenir.
                tabloFooterRowElement.append("<th/");
                //Tüm kolonlara karşılık gelen sütunlar eklendiğinde
                if (i == tablo.BaslikListe.length - 1) {
                    //Footer elemente ilgili toplam satırı eklenir
                    tabloFooterElement.append(tabloFooterRowElement);
                    //footer tablo elementine eklenir.



                    if (document.getElementById(footerID) != null)
                        $("#" + footerID).remove();

                    $(elm).append(tabloFooterElement);
                    //footer datalarını ilgili tag lara atan fonksiyon
                    footerOlustur = function (row, data, start, end, display) {
                        var api = this.api();
                        for (var i = 0; i < columns.length; i++) {
                            //tablonun ilgili sütunun footerdaki hücresine datayı at
                            $(api.column(i).footer()).html(
                                footerData.s[columns[i].tabloPropertyName]
                            );
                        }
                    }
                }
            }

        }

        if (options) {

            var bPaginate = true;
            var bSort = true;
            var dom = 'lfrtip';
            var bFilter = true;
            var bInfo = true;
            var dataPerPage = 25;
            var dataNumberSeletionPerPage = true;

            if (options.paging != undefined) {
                bPaginate = options.paging;
            }
            if (options.sort != undefined) {
                bSort = options.sort;
            }

            if (options.dom != undefined) {
                dom = options.dom;
            }

            if (options.filter != undefined) {
                bFilter = options.filter;
            }

            if (options.bInfo != undefined) {
                bInfo = options.bInfo;
            }
            if (options.dataPerPage != undefined) {
                dataPerPage = options.dataPerPage;
            }
            if (options.dataNumberSeletionPerPage != undefined) {
                dataNumberSeletionPerPage = options.dataNumberSeletionPerPage;
            }
            if (!bSort)
                aa_Sorting = [];

            var responsive = true;

            if (options.responsive !== undefined && options.responsive !== null) {
                responsive = options.responsive;
            }

            if ($.fn.DataTable.fnIsDataTable($(elm))) {
                var tbl = $(elm).dataTable();
                tbl.fnClearTable();
                tbl.fnDestroy(false);
                if (elm != "#tableContainerYukselenler" && elm != "#tableContainerDusenler") {
                    $(elm).empty();
                }
            }

            var tbl = $(elm).dataTable({
                "data": tablo.JSVeriler,
                "bDestroy": true,
                "responsive": false,
                "bSort": bSort,
                "dom": dom,
                "bPaginate": bPaginate,
                "bAutoWidth": false,
                "aaSorting": aa_Sorting,
                "bFilter": bFilter,                                //Arama kutusu
                "bInfo": bInfo,                                   //Tablodaki data bilgisi
                "bLengthChange": dataNumberSeletionPerPage,       //Her sayfadaki data sayısı seçimi
                "pageLength": dataPerPage,                         //Her sayfadaki data adedi
                columns: columns,
                footerCallback: footerOlustur,
                "lengthMenu": [[10, 25, 50, 100, -1], [10, 25, 50, 100, "Tümü"]]
            }
            );






            return tbl;
        }
        else {
            return $(elm).dataTable({
                "data": tablo.JSVeriler,
                "dom": " ",
                "bPaginate": false,
                "responsive": false,
                "bSort": false,
                "bDestroy": true,
                "aaSorting": aa_Sorting,
                columns: columns
            }
            );

        }

    }


function OnKarsilastirChecked(elm) {

    if (elm.checked) {
        AddHashParamValue("fonlar", $(elm).data("kod"));
    }
    else {
        RemoveHashParamValue("fonlar", $(elm).data("kod"));
    }

}
function BilesikTabloDoldur(elm, jdata, baslik, options) {


    var excelFileName = "fonbul";
    var showColRemoveBtn = false;
    if (options) {
        if (options.showColRemoveBtn===true) {
            showColRemoveBtn = true;
        }
        if (typeof options.excelFileName === "string") {
            excelFileName = options.excelFileName;
        }

    }


    var columns = [];

    columns[0] = {
        title: baslik,
        data: {
            _: "baslik.Text",
            sort: "baslik.Text"
        },
        className: "dt-left text-nowrap",
        render: function (data, type, full, meta) {

            return data;



            //    if (type == "display") {
            //        return data;
            //    }
            //    else {
            //        return full.o[meta.col];
            //    }

        },
    };

    //var newVeriler = [];

    //for (var i = 0; i < jdata.JSVeriler.length; i++) {

    //    var veri = jdata.JSVeriler[i];
    //    let customData = veri.Baslik.CustomData;

    //    var isGizle = false;

    //    if (typeof customData !== "undefined" && typeof customData.TabloYok === "boolean") {
    //        isGizle = customData.TabloYok;
    //    }

    //    if (!isGizle) {
    //        newVeriler.push(veri);
    //    }
    //}


    for (var i = 0; i < jdata.BaslikListe.length; i++) {

        var bs = jdata.BaslikListe[i];

        //var customData = bs.Baslik.CustomData;

        var isGoster = true;

        //if (typeof customData !== "undefined" && typeof customData.TabloYok === "boolean") {
        //    isGoster = customData.TabloYok;
        //}

        if (isGoster) {
            var column = {
                propertyName: bs.PropertyName,
                className: "dt-right",
                title: (showColRemoveBtn ? "<input type='button' value='X' class='btn btn-default' data-kod='" + bs.PropertyName +"' onclick='removeTabloColumn(\"" + elm +"\", this)' />&nbsp;":"")+bs.Baslik,
                data: {
                    _: "s." + bs.PropertyName,
                    sort: "o." + bs.PropertyName
                },
                render: function (data, type, full, meta) {
                    if (type == "display") {

                        return data;
                    }
                    else {
                        return data;//full.o[meta.col];
                    }
                },
                "createdCell": function (td, cellData, rowData, row, col) {

                    var cssClass = rowData.cssClass;
                    if (typeof cssClass === "string") {
                        if (typeof columns[col].propertyName === "string" && typeof rowData["cellData"]!=="undefined" && rowData["cellData"].indexOf(columns[col].propertyName) != -1) {

                            $(td).addClass(cssClass);
                        }
                    }
                }
            };

            columns.push(column);
        }
    }

    if ($.fn.DataTable.fnIsDataTable($('#' + elm))) {
        var tbl = $('#' + elm).dataTable();
        tbl.fnClearTable();
        tbl.fnDestroy(false);
        $('#' + elm).empty();
    }
    return tbl = $('#' + elm).dataTable(
        {
            "data": jdata.JSVeriler,
            "bDestroy": true,
            "responsive": false,
            "bPaginate": false,
            "bSort": false,
            "bAutoWidth": true,
            "sPaginationType": "full_numbers",
            "bFilter": false,
            "bInfo": false,
            "bLengthChange": false,
            "bPaginate": false,
            columns: columns,
            fixedHeader: false,
            dom: 'Bfrtip',
            buttons: [
                {
                    text: 'Excele Aktar',
                    extend: 'excel',
                    exportOptions: { orthogonal: 'export' },
                    autoFilter: true,
                    filename: function () { return excelFileName ? excelFileName : "fonbul"; }

                }
            ],

            drawCallback: function (settings) {
                var api = this.api();
                var rows = api.rows({ page: 'current' }).nodes();
                api.column(0, { page: 'current' })
                    .data()
                    .each(function (group, i) {

                        //grup (Grafik) başlıklarını colspan olsun
                        let bs = settings.aoData[i]._aData;
                        let customData = bs.CustomData;

                        let isGrupRow = false;

                        if (typeof customData !== "undefined" && typeof customData.KategoriBaslikMi === "boolean") {
                            isGrupRow = customData.KategoriBaslikMi;
                        }

                        if (isGrupRow) {
                            $(rows)
                                .eq(i)
                                .replaceWith(
                                    $('<tr class="group ' + ((i % 2) == 1 ? " even " : " odd ") + ' "></tr>').append($('<th colspan="' + columns.length + '"></th>').html(group))
                                );
                        }
                    });
            }
        }
    );

}

function removeTabloColumn(tbl, elm)
{
    var iIndex = $(elm).closest("th").prevAll("th").length;
    $("#"+tbl + " tr").each(function () {
        $(this).children("*:eq(" + iIndex +")").remove();
    });
    RemoveHashParamValue("fonlar", $(elm).data("kod"));
}
function YuzdeselIconHisse(deger, propName) {
    //Değer negatif ise
    if (deger.o[propName] < 0)
        return '<span class="signal-red">' + deger.s[propName] + ' </span>';
    //Değer pozitif ise
    if (deger.o[propName] > 0)
        return '<span class="signal-green">' + deger.s[propName] + '</span>';
    else return deger.s[propName];
}


function TabloBaslikYukleJS(webad) {
    var options = {
        type: "GET",
        cache: false,
        url: Servisurl + "/TabloBaslikListesi?webad=" + webad

    };
    return webService(options);
}

function TabloBaslikListeDoldurJS(data, drp, selectedValues) {
    var ddl = $('#' + drp);
    ddl.empty();
    ddl.selectpicker('destroy');
    var OptionGroupCache = "";
    var optgroup = document.createElement("optgroup");
    for (var i = 0; i < data.length; i++) {
        var OptionGroup = data[i].OptionGroup;
        if (typeof OptionGroup !== 'string') {
            OptionGroup = "";
        }

        if (OptionGroupCache != OptionGroup && OptionGroup != "") {
            OptionGroupCache = OptionGroup;
            optgroup = $("<optgroup/>");
            optgroup.attr("label", OptionGroup);
            ddl.append(optgroup);
        }

        if (typeof data[i].IsKategoriBaslik == "undefined" || data[i].IsKategoriBaslik == false) {
            let sutunName = data[i].Name;
            //kod gösterme
            if (sutunName !== "Kod" && sutunName !== "_FonHalkaArzTarihi" && sutunName !=="Fonlar") {
                var option = $("<option/>");

                option.attr("value", sutunName);
                option.attr("propertyName", sutunName);
                option.html(data[i].Text);
                ddl.append(option);
                if (selectedValues != undefined) {
                    for (var j = 0; j < selectedValues.length; j++) {
                        if (selectedValues[j] == sutunName) {
                            option.prop("selected", true);
                        }
                    }
                }
            }
        }

    }
    ddl.selectpicker({ deselectAllText: 'Tümünü Kaldır', selectAllText: 'Tümünü Seç', noneSelectedText:'Hiçbiri Seçilmedi' });
    ddl.selectpicker('create');
    
}


// Getiri sayfası için eklenmiştir
function GetiriTabloBaslikListeDoldurJS(data, drp, selectedValues) {
    var ddl = $('#' + drp);
    ddl.empty();
    ddl.selectpicker('destroy');
    var OptionGroupCache = "";
    var optgroup = document.createElement("optgroup");

    var defaultSelections = ["GunlukGetiri", "HaftabasindanGetiri", "AybasindanGetiri", "UcAylikGetiri", "_6AylikGetiri", "YilbasindanGetiri", "_1YillikGetiri", "_FonBilgiRiskDegeriAciklama"];


    for (var i = 0; i < data.length; i++) {
        var OptionGroup = data[i].OptionGroup;
        if (typeof OptionGroup !== 'string') {
            OptionGroup = "";
        }

        if (OptionGroupCache != OptionGroup && OptionGroup != "") {
            OptionGroupCache = OptionGroup;
            optgroup = $("<optgroup/>");
            optgroup.attr("label", OptionGroup);
            ddl.append(optgroup);
        }

        if (typeof data[i].IsKategoriBaslik == "undefined" || data[i].IsKategoriBaslik == false) {
            let sutunName = data[i].Name;

            //kod gösterme
            if (sutunName !== "Kod" && sutunName !== "Fonlar" && sutunName !== "SonFiyati") {
                var option = $("<option/>");

                option.attr("value", sutunName);
                option.attr("propertyName", sutunName);
                option.html(data[i].Text);
                ddl.append(option);
                if (typeof defaultSelections !== "undefined") {
                    for (var j = 0; j < defaultSelections.length; j++) {
                        if (defaultSelections[j] == sutunName) {
                            option.prop("selected", true);
                        }
                    }
                }
            }
        }

    }

    ddl.selectpicker({ deselectAllText: 'Tümünü Kaldır', selectAllText: 'Tümünü Seç', noneSelectedText: 'Hiçbiri Seçilmedi' });
    ddl.selectpicker('create');
}

function raporTabloYukleFonRating(elm, jdata, options) {

    var detaylink = null;
    var siralananSutun = null;
    var ArtanAzalan = "asc";
    var aa_Sorting = [];
    var siralananSutunNo;
    var grupSatirVar = false;
    var grupSatirAlt = true;
    var renkliSutunlar = [];
    var toplamSatir = false;
    var footerOlustur = null;

    if (options) {
        if (options.grupsatir != undefined) {
            grupSatirVar = options.grupsatir;
            if (options.grupalt != undefined) {
                grupSatirAlt = options.grupalt;
            }
        }
        if (options.detaylink != undefined) {
            detaylink = options.detaylink;
        }
        if (options.siralananSutun != undefined) {
            siralananSutun = options.siralananSutun;
        }
        if (options.artanAzalan != undefined) {
            ArtanAzalan = options.artanAzalan;
        }
        if (options.renkliSutunlar != undefined) {
            renkliSutunlar = options.renkliSutunlar;
        }
        if (options.toplamSatir != undefined) {
            toplamSatir = options.toplamSatir;
        }
    }

    var tablo = jdata.TabloListesi[0];
    var footerData = null;

    if (toplamSatir) {
        //footer datası ilgili verilerden alınır.
        footerData = tablo.JSVeriler[tablo.JSVeriler.length - 1];
        //tabloya yüklenecek değerlerden toplam datası çıkarılır
        tablo.JSVeriler.length = tablo.JSVeriler.length - 1
    }
    var columns = [];

    var tabloFooterElement = "";
    var tabloFooterRowElement = "";
    for (var i = 0; i < tablo.BaslikListe.length; i++) {

        columns.push({
            title: tablo.BaslikListe[i].Baslik,
            tabloPropertyName: tablo.BaslikListe[i].PropertyName,
            data: {
                _: "o." + tablo.BaslikListe[i].PropertyName,
                sort: "o." + tablo.BaslikListe[i].PropertyName
            },
            bSortable: true,
            //sType: "numeric",
            sType: "nullable",


            render: function (data, type, full, meta) {

                if ((type == 'display')) {

                    //aşağı <i class=" glyphicon glyphicon-chevron-down"></i>
                    //yıldız <i class="glyphicon glyphicon-star"></i>
                    if (detaylink && (columns[meta.col].tabloPropertyName == 'Kod' || columns[meta.col].tabloPropertyName == 'Ad' || columns[meta.col].tabloPropertyName == 'Fon' || columns[meta.col].tabloPropertyName == 'Fonlar') || columns[meta.col].tabloPropertyName == 'FonAdi') {

                        if (tablo.JSVeriler[meta.row].s.Kod != undefined) {

                            if (grupSatirVar && ((!grupSatirAlt && meta.row == 0) || (grupSatirAlt && meta.row == tablo.JSVeriler.length - 1))) {
                                return YuzdeselIconHisse(full, tablo.BaslikListe[meta.col].PropertyName);
                            }

                            return "<a href='" + appUrl + "/" + detaylink + "/" + tablo.JSVeriler[meta.row].s.Kod.replace(/\./g, "").replace(/ /g, "") + "'>" + data + "</a>"; //link,Kod alanı içerisindeki nokta ve boşluklar silinerek oluşturuluyor.
                        }
                        else {
                            return YuzdeselIconHisse(full, tablo.BaslikListe[meta.col].PropertyName);
                        }


                    }
                    else if (columns[meta.col].tabloPropertyName == 'OncekiRating' || columns[meta.col].tabloPropertyName == 'Rating') {
                        var yildiz = '';

                        for (var i = 0; i < full.s[columns[meta.col].tabloPropertyName]; i++) {
                            yildiz = yildiz + '<i class="glyphicon glyphicon-star"></i>';
                        }


                        return yildiz;
                    }
                    else if (columns[meta.col].tabloPropertyName == 'Degisim') {
                        if (full.s[columns[meta.col].tabloPropertyName] == 0)
                            return "<img class='glyphicon-esittir' src='" + appUrlRoot + "/images/esittir.png' />";
                        else if (full.s[columns[meta.col].tabloPropertyName] > 0)
                            return '<i class=" glyphicon glyphicon-chevron-up"></i>';
                        else if (full.s[columns[meta.col].tabloPropertyName] < 0)
                            return '<i class=" glyphicon glyphicon-chevron-down"></i>';
                        else return data;
                    }
                    else {
                        return data;
                    }

                }
                else {
                    return data;
                }

            }
        });

        if (i > 1) {
            columns[columns.length - 1].className = "dt-right";
        }


        if (columns[i].tabloPropertyName == siralananSutun) {
            siralananSutunNo = i;

            aa_Sorting = [[siralananSutunNo, ArtanAzalan]];
        }
        //Tabloda toplam satırı var ise
        if (toplamSatir) {

            var footerID = elm.replace('#', '') + "Footer";

            //İlk footer ve satır elementi oluşturulur.
            if (i == 0) {
                tabloFooterElement = $("<tfoot/ id='" + footerID + "'>");
                tabloFooterRowElement = $("<tr/>");
            }
            //satır elementine ilgili sütunlar eklenir.
            tabloFooterRowElement.append("<th/");
            //Tüm kolonlara karşılık gelen sütunlar eklendiğinde
            if (i == tablo.BaslikListe.length - 1) {
                //Footer elemente ilgili toplam satırı eklenir
                tabloFooterElement.append(tabloFooterRowElement)
                //footer tablo elementine eklenir.



                if (document.getElementById(footerID) != null)
                    document.getElementById(footerID).remove();

                $(elm).append(tabloFooterElement)
                //footer datalarını ilgili tag lara atan fonksiyon
                footerOlustur = function (row, data, start, end, display) {
                    var api = this.api();
                    for (var i = 0; i < columns.length; i++) {
                        //tablonun ilgili sütunun footerdaki hücresine datayı at
                        $(api.column(i).footer()).html(
                            footerData.s[columns[i].tabloPropertyName]
                        );
                    }
                }
            }
        }

    }

    if (options) {

        var bPaginate = true;
        var bSort = true;
        var dom = 'lfrtip';
        var bFilter = true;
        var bInfo = true;
        var dataPerPage = 50;
        var dataNumberSeletionPerPage = true;

        if (options.paging != undefined) {
            bPaginate = options.paging;
        }
        if (options.sort != undefined) {
            bSort = options.sort;
        }

        if (options.dom != undefined) {
            dom = options.dom;
        }

        if (options.filter != undefined) {
            bFilter = options.filter;
        }

        if (options.bInfo != undefined) {
            bInfo = options.bInfo;
        }
        if (options.dataPerPage != undefined) {
            dataPerPage = options.dataPerPage;
        }
        if (options.dataNumberSeletionPerPage != undefined) {
            dataNumberSeletionPerPage = options.dataNumberSeletionPerPage;
        }
        if (!bSort)
            aa_Sorting = [];


        return $(elm).dataTable({
            "data": tablo.JSVeriler,
            "bDestroy": true,
            "responsive": true,
            "bSort": bSort,
            "dom": dom,
            "bPaginate": bPaginate,
            "bAutoWidth": false,
            "aaSorting": aa_Sorting,
            "bFilter": bFilter,                                //Arama kutusu
            "bInfo": bInfo,                                   //Tablodaki data bilgisi
            "bLengthChange": dataNumberSeletionPerPage,       //Her sayfadaki data sayısı seçimi
            "pageLength": dataPerPage,                         //Her sayfadaki data adedi
            columns: columns,
            footerCallback: footerOlustur
        }
        );

    }
    else {
        return $(elm).dataTable({
            "data": tablo.JSVeriler,
            "dom": " ",
            "bPaginate": false,
            "responsive": true,
            "bSort": false,
            "bDestroy": true,
            "aaSorting": aa_Sorting,
            columns: columns
        }
        );

    }

}


function raporTabloYukleArtanAzalan(elm, jdata) {

    var tablo = jdata.TabloListesi[0];
    var columns = [];
    for (var i = 0; i < tablo.BaslikListe.length; i++) {
        //if (!detaylink || tablo.BaslikListe[i].PropertyName != 'Kod') {

        columns.push({
            //title:' ',// tablo.BaslikListe[i].Baslik,
            tabloPropertyName: tablo.BaslikListe[i].PropertyName,
            data: {
                _: "s." + tablo.BaslikListe[i].PropertyName,
                sort: "o." + tablo.BaslikListe[i].PropertyName
            },
            bSortable: true,
            //sType: "numeric",
            //  sType: "nullable",
            className: (numericFormatClassName(tablo.BaslikListe[i].VeriFormat)),


            render: function (data, type, full, meta) {

                if (meta.col == 2) {

                    return data + "<img src='" + appUrlRoot + "/images/red_arow.png' />";


                } else if (meta.col == 1) {

                    return data + "<img src='" + appUrlRoot + "/images/green_arow.png' />";

                } else if (meta.col == 3) {


                    return data + " % " + (full.o[columns[meta.col].tabloPropertyName] >= 0 ? "<img src='" + appUrlRoot + "/images/green_arow.png' />" : "<img src='" + appUrlRoot + "/images/red_arow.png' />");

                }

                return data;
            }
        });

    }


    return $(elm).dataTable({
        "data": tablo.JSVeriler,
        "dom": " ",
        "bPaginate": false,
        "responsive": true,
        "bSort": false,
        "bDestroy": true,
        //"aaSorting": aa_Sorting,
        columns: columns
    });



}

function hataliKarakterTemizle(metin) {
    var replaceChar = "/";

    metin = metin.split("'").join("")
        .split(",").join(replaceChar)
        .split("#").join("")
        .split("@").join("")
        .split("$").join("")
        .split("%").join("")
        .split("=").join("")
        .split("&").join("")
        .split("?").join("")
        .split("+").join("")
        .split("*").join("")
        .split(":").join("")
        .split("’").join("")
        .split(";").join("")
        .split("\n").join("")
        .split(",").join("")
        .split("\\").join("")
        .split("/").join("")
        .split("<").join("")
        .split(">").join("")
        .split("'").join("")
        .split(",").join("")
        .split("\r").join("")
        .split("\n").join("");

    while (metin.indexOf("--") != -1) {
        metin = metin.split("--").join("-");
    }

    return metin;
}



// Tablo Yükle-> Anasayfa, repo
function raporTabloYukleRepo(elm, jdata, sortable, detaylink) {

    var tablo = jdata.TabloListesi[0];
    var columns = [];

    columns[0] = {
        title: '',
        data: {
            _: "s." + tablo.BaslikListe[0].PropertyName,
            sort: "o." + tablo.BaslikListe[0].PropertyName
        },
        className: "dt-left",

        render: function (data, type, full, meta) {

            if ((type == 'display' || type == 'filter') && meta.col == 0) {

                var Tarih = new Date(full.o.Tarih.split('-')[0], (full.o.Tarih.split('-')[1]) - 1, full.o.Tarih.split('-')[2]);
                var Valor = new Date(full.o.Valor.split('-')[0], (full.o.Valor.split('-')[1]) - 1, full.o.Valor.split('-')[2]);
                var timeDiff = Math.abs(Valor - Tarih);
                var diffDays = Math.ceil(timeDiff / (1000 * 3600 * 24));
                return '<b>' + diffDays + LocalizationManager.Gunluk + '</b>';


            }

            return data;

        }
    };



    var k = 1;
    for (var i = 2; i < tablo.BaslikListe.length; i++) {
        if (!detaylink || tablo.BaslikListe[i].PropertyName != 'Kod') {

            columns[k] = {
                title: tablo.BaslikListe[i].Baslik,
                data: {
                    _: "s." + tablo.BaslikListe[i].PropertyName,
                    sort: "o." + tablo.BaslikListe[i].PropertyName
                },
                className: (numericFormatClassName(tablo.BaslikListe[i].VeriFormat)),


                render: function (data, type, full, meta) {
                    if (detaylink) {
                        if ((type == 'display' || type == 'filter') && meta.col == 0) {
                            //to do rapora kod ekle
                            return "<a href='" + detaylink + "/" + tablo.JSVeriler[meta.row].s.Kod + "'>" + data + "</a>";
                        }
                    }
                    return data;

                }
            };
            k++;
        }
    }

    if (sortable) {
        return $(elm).dataTable({
            "data": tablo.JSVeriler,
            "dom": "",
            "bPaginate": false,
            "responsive": true,
            "bSort": true,
            "bDestroy": true,
            columns: columns
        }
        );

    }
    else {
        return $(elm).dataTable({
            "data": tablo.JSVeriler,
            "dom": " ",
            "bPaginate": false,
            "responsive": true,
            "bSort": false,
            "bDestroy": true,
            columns: columns
        }
        );

    }

}

function raporTabloYukleGrupAnaliz(elm, jdata, options, detaylink, siralananSutun, ArtanAzalan) {

    var aa_Sorting = [];
    var siralananSutunNo;

    var tablo = jdata.TabloListesi[0];
    var columns = [];
    for (var i = 0; i < tablo.BaslikListe.length; i++) {
        if (!detaylink || tablo.BaslikListe[i].PropertyName != 'Kod') {

            columns.push({
                title: tablo.BaslikListe[i].Baslik,
                tabloPropertyName: tablo.BaslikListe[i].PropertyName,
                data: {
                    _: "o." + tablo.BaslikListe[i].PropertyName,
                    sort: "o." + tablo.BaslikListe[i].PropertyName
                },
                bSortable: true,
                //sType: "numeric",
                sType: "nullable",
                className: (numericFormatClassName(tablo.BaslikListe[i].VeriFormat)),


                render: function (data, type, full, meta) {

                    if ((type == 'display')) {

                        if (detaylink && meta.col == 0) {

                            if (tablo.JSVeriler[meta.row].s.Kod != undefined) {
                                return "<a href='" + detaylink + "/" + tablo.JSVeriler[meta.row].s.Kod + "'>" + data + "</a>";
                            }
                            else {
                                return "<a href='" + detaylink + "'>" + data + "</a>";
                            }
                        }
                        else
                            if (meta.col == 0) {
                                return '<div class="grupDetay' + full.s.FonKategoriDerinlik + '">' + full.s[columns[meta.col].tabloPropertyName] + '</div>';
                            }
                            else if (full.s.FonKategoriDerinlik > 2) {
                                return '<div class="grupDetayDeger">' + full.s[columns[meta.col].tabloPropertyName] + '</div>';
                            }
                            else {
                                return full.s[columns[meta.col].tabloPropertyName];
                            }
                    }
                    else {
                        return data;
                    }
                }
            });

        }

        if (siralananSutun == undefined && ArtanAzalan == undefined) {
            aa_Sorting = [];
        }
        else {

            if (columns[i].tabloPropertyName == siralananSutun) {
                siralananSutunNo = i;

                aa_Sorting = [[siralananSutunNo, ArtanAzalan]];
            }
        }

    }

    if (options) {
        var bPaginate = true;
        var bSort = true;

        if (options.paging != undefined) {
            bPaginate = options.paging;
        }
        if (options.sort != undefined) {
            bSort = options.sort;
        }
        if (!bSort)
            aa_Sorting = [];

        return $(elm).dataTable({
            "data": tablo.JSVeriler,
            "dom": " ",
            "bPaginate": bPaginate,
            "responsive": true,
            "bSort": bSort,
            "bDestroy": true,
            "aaSorting": aa_Sorting,
            columns: columns
        }
        );

    }
    else {
        return $(elm).dataTable({
            "data": tablo.JSVeriler,
            "dom": " ",
            "bPaginate": false,
            "responsive": true,
            "bSort": false,
            "bDestroy": true,
            "aaSorting": aa_Sorting,
            columns: columns
        }
        );

    }

}

//Profil Bilgileri ve Fon Analiz Getiri Tablosu Yüklenmesi
function raporDetayTabloYukle(elm, jdata, basIndex, bitIndex) {

    var tablo = jdata.TabloListesi[0];

    var body = $("<tbody/>")
    for (var i = basIndex; i <= bitIndex; i++) {
        //gelen data kadar satır
        var row = $("<tr/>");
        //iki tane sütun
        for (var j = 0; j < 2; j++) {
            if (j == 0) {
                if (tablo.WebAd == "fonbul-profil-getiriler") {
                    row.append($("<th/>").text(tablo.BaslikListe[i].Baslik + " (%)"))
                }
                else {
                    row.append($("<th/>").text(tablo.BaslikListe[i].Baslik))
                }
            }
            else {
                if (tablo.BaslikListe[i].PropertyName == "WebAdresi") {
                    row.append($("<td/>").append(
                        $("<a/>").attr("href", jdata.TabloListesi[0].JSVeriler[0].s[tablo.BaslikListe[i].PropertyName])
                            .attr("target", "_blank").text(jdata.TabloListesi[0].JSVeriler[0].s[tablo.BaslikListe[i].PropertyName]))
                    );
                }
                else
                    row.append($("<td/>").text(jdata.TabloListesi[0].JSVeriler[0].s[tablo.BaslikListe[i].PropertyName]))
            }
        }
        body.append(row);

        $(elm).append(body);

    }

}

//TABLO YÜKLEME FONKSİYONLARI, BİTİŞ

function ChartColumnsJS(tablo, columns, tarihAlan, startRow, endRow) {

    if (!endRow || endRow <= 0) {
        endRow = tablo.JSVeriler.length - 1;//Data.table.length-> veri sayısı
    }

    if (!startRow || startRow < 0) {
        startRow = 0;
    }

    var tarihColumnIndex = -1;
    for (var i = 0; i < columns.length; i++) {

        var col = columns[i];
        col.ColumnIndex = -1;
        for (var j = 0; j < tablo.BaslikListe.length; j++) {//Data.$schema.Info.length-> sütun sayısı
            var info = tablo.BaslikListe[j];
            if (col.Alan == info.Alan) {
                col.ColumnIndex = i;
                col.Veriler = new Array(endRow - startRow + 1);
                if (!col.Baslik || col.Baslik == "") {
                    col.Baslik = info.Baslik;

                }


            }
            if (info.Alan == tarihAlan) {
                col.tarihColumnIndex = j;

            }
            else {
                col.tarihColumnIndex = -1;
            }
            if (col.ColumnIndex != -1) break;
        }


    }

    for (var j = 0; j < columns.length; j++) {
        var col = columns[j];
        if (col.ColumnIndex != -1) {

            for (var i = startRow; i <= endRow; i++) {
                var parts = tablo.JSVeriler[i].o[tarihAlan].split('-');
                if (col.tarihColumnIndex != -1) {

                    col.Veriler[i] = [Date.UTC(parts[0], parts[1] - 1, parts[2]), tablo.JSVeriler[i].o.Tarih];//Data.table[i][columns[j].ColumnName];
                }
                else {
                    col.Veriler[i] = [Date.UTC(parts[0], parts[1] - 1, parts[2]), tablo.JSVeriler[i].o[columns[col.ColumnIndex].Alan]];//Data.table[i][columns[j].ColumnName];
                }

            }
        }

    }
    return columns;
}

function replaceAll(find, replace, str) {
    return str.replace(new RegExp(find, 'g'), replace);
}
function DinamikYorumGetir(yorum, params) {

    for (var i = 0; i < params.length; i++) {

        yorum = replaceAll(params[i].key, params[i].value, yorum);
    }

    return yorum;
}

function GununOzetiTablo(tablo, params) {
    for (var i = 0; i < params.length; i++) {
        tablo = tablo.replace(params[i].key, params[i].value);
    }
    return tablo;

}

function formatNumber(num) {
    return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,")
}

function htmlEncode(value) {
    //create a in-memory div, set it's inner text(which jQuery automatically encodes)
    //then grab the encoded contents back out.  The div never exists on the page.
    return $('<div/>').text(value).html();
}

function htmlDecode(value) {
    return $('<div/>').html(value).text();
}

function webService(options, prop, propValue) {

    var prop = prop;
    var propValue = propValue;
    var deferred = $.Deferred();


    var request = $.ajax(options);

    var promise = request.then(
        function (response) {

            return prop ? (propValue ? response[prop][propValue] : response[prop]) : response;
        },
        function (response) {

            //return ($.reject("Hata oluştu!"));

        }
    );

    return promise;

}


var urlDeger = "";
var enterClik = "";

function Search(element, e) {
    var dataobject = null;
    var aranankelime = $("#search_input").val();
    var fon = secilenFon;
    var kontrol = false;
    //if (aranankelime != undefined && aranankelime != null && aranankelime != "") {
    //    //  aranankelime = $.trim(aranankelime);
    //    // aranankelime = aranankelime.replace(/\s*$/, "");
    //    //if (aranankelime.startsWith(" ")) {
    //    //    aranankelime = $.trim(aranankelime);
    //    //}
    //}
    //FonAnatipId
    //var options = {
    //    //AramaKriter: {
    //    yatirimfonlari: "1",
    //    emeklilikfonlari: "0",
    //    kurucu: "0",
    //    yonetici: "1"
    //    //}
    //};
    //if (FonAnatipId == "2")
    //{
    //    options.yatirimfonlari = "0"

    //}

    $.ajax({
        url: appUrl + "/Arama/GenelArama",
        datatype: "json",
        type: "Post",
        //data: { aranan: aranankelime, options: options }
        data: { aranan: aranankelime }
    }).done(function (data, e) {

        $("#AramaSonuc").html("");

        var yatirimLength = 0;
        var yatirimOrakligiLenght = 0;
        var anaParaLenght = 0;
        var emeklilikLenght = 0;
        var yoneticiLenght = 0;
        var kurucuLength = 0;
        var aramaLength = 0;

        if (IsYatirim) {

            if (data.YatirimFonlari != null) {
                yatirimLength = data.YatirimFonlari.length;
                var baslikFon = "<li class=''><span><a href='#'>" + LocalizationManager.YatirimFonlari + "</a></span></li>";
                $("#AramaSonuc").append(baslikFon);

                for (var i = 0; i < data.YatirimFonlari.length; i++) {

                    var tr = "";
                    var item = data.YatirimFonlari[i];
                    var deger = appUrl + '/FonProfilleri/FonAnaliz/' + item.Kod;
                    var url = item.Url;
                    var sonucTr = "";

                    urlDeger = deger;

                    tr += "<li><span>" + "<a href=" + deger + ">" + item.Kod + ' - ' + item.Baslik + "</a></span></li>";
                    $("#AramaSonuc").append(tr);

                    //if (data.YatirimFonlari.length == 1) {
                    //    enterClik = "ok";
                    //}
                }
            }

            if (data.YatirimOrakligiFonlari != null) {
                yatirimOrakligiLenght = data.YatirimOrakligiFonlari.length;

                var baslikFon = "<li class=''><span><a href='#'>" + LocalizationManager.YatirimOrtakligi + "</a></span></li>";
                $("#AramaSonuc").append(baslikFon);

                for (var i = 0; i < data.YatirimOrakligiFonlari.length; i++) {
                    var tr = "";
                    var item = data.YatirimOrakligiFonlari[i];
                    var deger = appUrl + '/FonProfilleri/FonAnaliz/' + item.Kod;
                    var url = item.Url;
                    var sonucTr = "";

                    urlDeger = deger;
                    tr += "<li><span>" + "<a href=" + deger + ">" + item.Kod + ' - ' + item.Baslik + "</a></span></li>";
                    $("#AramaSonuc").append(tr);
                    //if (data.YatirimOrakligiFonlari.length == 1) {
                    //    enterClik = "ok";
                    //}
                }
            }

            if (data.AnaParaGarantiliFonlar != null) {
                anaParaLenght = data.AnaParaGarantiliFonlar.length;

                var baslikFon = "<li class=''><span><a href='#'>" + LocalizationManager.AnaparaveGarantili + "</a></span></li>";
                $("#AramaSonuc").append(baslikFon);

                for (var i = 0; i < data.AnaParaGarantiliFonlar.length; i++) {
                    var tr = "";
                    var item = data.AnaParaGarantiliFonlar[i];

                    var deger = appUrl + '/FonProfilleri/FonAnaliz/' + item.Kod;
                    var url = item.Url;
                    var sonucTr = "";

                    urlDeger = deger;
                    tr += "<li><span>" + "<a href=" + deger + ">" + item.Kod + ' - ' + item.Baslik + "</a></span></li>";
                    $("#AramaSonuc").append(tr);
                    //if (data.AnaParaGarantiliFonlar.length == 1) {
                    //    enterClik = "ok";
                    //}
                }
            }
        }
        else {

            if (data.EmeklilikFonlari != null) {
                emeklilikLenght = data.EmeklilikFonlari.length;

                var baslikFon = "<li class=''><span><a href='#'>" + LocalizationManager.EmeklilikFonlari + "</a></span></li>";
                $("#AramaSonuc").append(baslikFon);
                for (var i = 0; i < data.EmeklilikFonlari.length; i++) {
                    var tr = "";
                    var item = data.EmeklilikFonlari[i];
                    var url = item.Url;
                    var deger = appUrl + '/FonProfilleri/FonAnaliz/' + item.Kod;

                    var sonucTr = "";

                    urlDeger = deger;
                    tr += "<li><span>" + "<a href=" + deger + ">" + item.Kod + ' - ' + item.Baslik + "</a></span></li>";
                    $("#AramaSonuc").append(tr);
                    //if (data.EmeklilikFonlari.length == 1) {
                    //    enterClik = "ok";
                    //}
                }
            }
        }
        if (data.YoneticiListe != null) {
            yoneticiLenght = data.YoneticiListe.length;
            var baslikFon = "<li class=''><span><a href='#'>" + LocalizationManager.FonYonetici + "</a></span></li>";
            $("#AramaSonuc").append(baslikFon);

            for (var i = 0; i < data.YoneticiListe.length; i++) {

                var tr = "";
                var item = data.YoneticiListe[i];
                var url = item.Url;
                //var deger = appUrl + url + "/" + item.Kod.replace(/\ /g, "");
                var deger = appUrl + '/FonProfilleri/FonAnaliz/' + item.Kod.replace(/\ /g, "");

                var sonucTr = "";

                urlDeger = deger;

                tr += "<li><span>" + "<a href=" + deger + ">" + item.Kod + ' - ' + item.Baslik + "</a></span></li>";
                $("#AramaSonuc").append(tr);

                //if (data.YoneticiListe.length == 1) {
                //    enterClik = "ok";
                //}
            }
        }

        if (data.KurucuListe != null) {

            kurucuLength = data.KurucuListe.length;

            var baslikFon = "<li class=''><span><a href='#'>" + LocalizationManager.FonKurucu + "</a></span></li>";
            $("#AramaSonuc").append(baslikFon);

            for (var i = 0; i < data.KurucuListe.length; i++) {

                var tr = "";
                var item = data.KurucuListe[i];
                var url = item.Url;
                //var deger = appUrl + url + "/" + item.Kod.replace(/\ /g, "");
                var deger = appUrl + '/FonProfilleri/FonAnaliz/' + item.Kod.replace(/\ /g, "");

                var sonucTr = "";

                urlDeger = deger;

                tr += "<li><span>" + "<a href=" + deger + ">" + item.Kod + ' - ' + item.Baslik + "</a></span></li>";
                $("#AramaSonuc").append(tr);

                //if (data.KurucuListe.length == 1) {
                //    enterClik = "ok";
                //}
            }
        }
        if (data.AramaSonucList != null && data.KurucuListe == null && data.YoneticiListe == null) {
            aramaLength = data.AramaSonucList.length;
            for (var i = 0; i < data.AramaSonucList.length; i++) {
                var tr = "";
                var deger = "";
                dataobject = data;
                var item = data.AramaSonucList[i];
                var url = item.Url;
                var sonucTr = "";
                if (item.Url == "/") {
                    deger = "/Home/Index";
                }
                else {
                    if (fon != undefined && fon != null && fon != "") {

                        if (url.indexOf("ANU") > -1)
                            deger = url.replace("ANU", fon);
                        else
                            deger = url.replace("ANE", fon);
                    }
                    else
                        deger = url;
                }
                urlDeger = appUrl + deger;
                tr += "<li><span>" + "<a href=" + appUrl + deger + ">" + item.Baslik + "</a></span></li>";
                $("#AramaSonuc").append(tr);
                //if (data.AramaSonucList.length == 1) {
                //    enterClik = "ok";
                //}
            }
        }

        var lenght = yatirimLength + yatirimOrakligiLenght + anaParaLenght + emeklilikLenght + yoneticiLenght + kurucuLength + aramaLength;
        if (lenght == 1) {
            enterClik = "ok";
        } else {
            enterClik = "";
        }


    });


    //if (e == 13 && urlDeger != "" && enterClik == "ok") {

    //    window.location.href = urlDeger;
    //}

}
function SayfaDuzen(sayfa) {
    if (sayfa != undefined && sayfa != null && sayfa != "") {
        $('html, body').animate({ scrollTop: 0 }, 'fast');
        $('#bp-3-element-test').find('li').each(function () {
            $(this).removeClass("active");
        });
        $('#sayfa_' + sayfa).addClass("active");
        //geri butonu
        if (sayfa > 1) {
            document.getElementById("page-geri").href = "javascript:tabloHesapla(" + (sayfa - 1) + ")";
            $("#page-geri").css("display", "");
        } else {
            $("#page-geri").css("display", "none");
        }

        $('#bp-3-element-test').find('li').each(function () {

            var id = $(this).attr('id');


            if (id != undefined) {
                if (id == "sayfa_1" || id == "sayfa_" + sayfaAdedi || id == "sayfa_" + (sayfa + 1) || id == "sayfa_" + (sayfa - 1) || id == "sayfa_" + (sayfa) || id == "span_" + (sayfa - 3)) {
                    $(this).css("display", "");
                }
                else {
                    $(this).css("display", "none");
                }

                if (id == "span_" + (sayfa)) {
                    if ((sayfa + 4) == sayfaAdedi) {
                        $(this).css("display", "none");
                        for (i = 1; i < 5; i++) {
                            $("#sayfa_" + (sayfa + i)).css("display", "");
                        }
                        $("#sayfa_" + (sayfa - 1)).css("display", "none");
                        return false;
                    } else if ((sayfa + 3) == sayfaAdedi || (sayfa + 2) == sayfaAdedi || (sayfa + 1) == sayfaAdedi) {
                        for (i = 1; i < 5 - (sayfaAdedi - sayfa); i++) {
                            $("#sayfa_" + (sayfa - i)).css("display", "");
                        }
                        $("#span_" + (sayfa - 3)).css("display", "none");
                        $("#span_1").css("display", "");

                        return false;
                    }
                    else {
                        $(this).css("display", "");
                    }
                }

                if (sayfa == 2 || sayfa == 3 || sayfa == 4) {
                    for (var i = 1; i < 5 - sayfa; i++) {
                        $("#sayfa_" + i).css("display", "");
                        $("#span_" + i).css("display", "none");
                    }
                    $("#sayfa_6").css("display", "none");
                    return false;
                }
                if (sayfa == 1) {
                    if (id.indexOf("sayfa_") > -1) {
                        $(id).css("display", "none");
                    }
                    for (i = 1; i < 6; i++) {
                        $("#sayfa_" + i).css("display", "");
                    }
                    $("#span_" + sayfa).css("display", "none");
                    $("#span_" + (sayfa + 3)).css("display", "");
                }
            }
        });

        //ileri butonu
        if (sayfa != sayfaAdedi) {
            // document.getElementById("page-ileri").onclick="tabloHesapla("+(sayfa+1)+")";
            document.getElementById("page-ileri").href = "javascript:tabloHesapla(" + (sayfa + 1) + ")";
            if (sayfaAdedi > 1)
                $("#page-ileri").css("display", "");
            else
                $("#page-ileri").css("display", "none");
        } else {
            if (sayfaAdedi > 5) {
                for (i = 1; i < 5 - (sayfaAdedi - sayfa); i++) {
                    $("#sayfa_" + (sayfa - i)).css("display", "");
                }
                $("#span_" + (sayfa - 3)).css("display", "none");
                $("#span_1").css("display", "");
            }
            $("#page-ileri").css("display", "none");
            return false;
        }
        //ilk 5 sayfada ise
        $('#sayfa_' + sayfa).addClass("active");
    }
}

function Sayfalama(elm, sayfaAdedi, sayfa) {

    $(elm).html('');

    if (!sayfa || sayfa < 1) sayfa = 1;
    sayfa = parseInt(sayfa);
    var sonrakisayfa = parseInt(sayfa) + 1;
    var oncekisayfa = parseInt(sayfa) - 1;
    var sayfalamaSonu = 5;

    if (sayfaAdedi < sayfalamaSonu) sayfalamaSonu = sayfaAdedi;


    var basSayfa = sayfa - Math.floor(sayfalamaSonu / 2);

    if (basSayfa <= 0) basSayfa = 1;


    var bitisSayfa = sayfalamaSonu + basSayfa - 1;




    if (bitisSayfa > sayfaAdedi) {
        bitisSayfa = sayfaAdedi;
        basSayfa = sayfaAdedi - sayfalamaSonu;
    }


    if (basSayfa <= 0) basSayfa = 1;




    if (oncekisayfa >= 1) {


        if (sayfa > 2) {
            var aHrefIlk = '<li><a  href="javascript:tabloHesapla(1,' + undefined + ',' + true + ')" aria-label="Last"><span aria-hidden="true">İlk&raquo;</span></a></li>';
            $(elm).append(aHrefIlk);
        }

        var aHref = '<li><a href="javascript:tabloHesapla(' + oncekisayfa + ',' + undefined + ',' + true + ')" aria-label="Previous"><span aria-hidden="true">&laquo;Geri</span></a></li>';
        $(elm).append(aHref);
    }

    for (i = basSayfa; i <= bitisSayfa; i++) {

        //seçili sayfa
        if (i == sayfa) {
            $(elm).append('<li class="active"><a href="javascript:tabloHesapla(' + (i) + ',' + undefined + ',' + true + ')">' + (i) + '</a></li>');
        }
        else {
            $(elm).append('<li><a href="javascript:tabloHesapla(' + (i) + ',' + undefined + ',' + true + ')">' + (i) + '</a></li>');
        }


    }
    if (sayfaAdedi > 1) {

        if (sonrakisayfa < sayfaAdedi) {
            var aHrefNext = '<li><a  href="javascript:tabloHesapla(' + sonrakisayfa + ',' + undefined + ',' + true + ')" aria-label="Next"><span aria-hidden="true">İleri&raquo;</span></a></li>';
            $(elm).append(aHrefNext);

        }

        if (sayfaAdedi > sonrakisayfa) {
            var aHrefSon = '<li><a  href="javascript:tabloHesapla(' + sayfaAdedi + ',' + undefined + ',' + true + ')" aria-label="Last"><span aria-hidden="true">Son&raquo;</span></a></li>';
            $(elm).append(aHrefSon);
        }



    }

}


function adetFormat(adet) {
    return adet.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1,");
}



Array.prototype.swapItems = function (a, b) {
    this[a] = this.splice(b, 1, this[a])[0];
    return this;
}


function dateFormat(date) {
    return moment(data, "DD/MM/YYYY").format("YYYY-MM-DD")
    //var dateItems = date.split("/");
    //return dateItems[2] + "-" + dateItems[1] + "-" + dateItems[0];
}


function ParamParse(key, value) {
    let deger = "";
    if (typeof value === "string" && value.length > 0) {
        const urlParams = new URLSearchParams(value);
        deger = urlParams.get(key);
    }
    return deger;
}

function GetHashParamValue(key) {
    let deger = "";
    if (window.location.hash !== null) {
        deger = ParamParse(key, window.location.hash.replace("#", ""));
    }
    return deger;
}

function SetHashParamValue(key, deger) {
    var hdeger = window.location.hash;
    if (hdeger == null) {
        hdeger = "";
    }
    else {
        hdeger = hdeger.replace("#", "");
    }

    if (hdeger !== "") {
        var olddeger = GetHashParamValue(key);
        hdeger = hdeger.replace(key + "=" + olddeger, key + "=" + deger);
    }

    window.location.hash = (hdeger == "" ? hdeger : "&") + (key + "=" + deger);
}

function AddHashParamValue(key, deger) {
    var olddeger = ParamParse(key, window.location.hash.replace("#", ""));
    if (olddeger != "") {
        olddeger = olddeger + "," + deger;
    }
    else {
        olddeger = deger;
    }
    SetHashParamValue(key, olddeger);
}

function RemoveHashParamValue(key, deger) {
    var olddeger = ParamParse(key, window.location.hash.replace("#", ""));
    if (olddeger != "") {
        //önce ,ile sonra virgül olmadan
        olddeger = olddeger.replace("," + deger, "").replace(deger, "");
        olddeger = trim(olddeger,",");
    }

    SetHashParamValue(key, olddeger);
}


function CookieParamValue(cname, key) {
    let deger = "";
    let cdeger = getCookie(cname);

    if (cdeger !== "") {
        deger = ParamParse(key, cdeger);
    }
    return deger;
}

function getCookie(c_name) {
    if (document.cookie.length > 0) {
        c_start = document.cookie.indexOf(c_name + "=");
        if (c_start != -1) {
            c_start = c_start + c_name.length + 1;
            c_end = document.cookie.indexOf(";", c_start);
            if (c_end == -1) {
                c_end = document.cookie.length;
            }
            return document.cookie.substring(c_start, c_end);
        }
    }
    return "";
}