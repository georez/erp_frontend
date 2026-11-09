'use client';

import useSWR from 'swr';
import { useEffect, useRef, useState } from 'react';
import { fetchJson } from '@/utils/fetchJson';
import { Big } from 'bigdecimal.js';
import { formatAmount, formatDecimal } from '@/utils/decimals';

const SETTINGS_URL = '/api/settings';
const LOGO_URL = '/api/settings/logo';

/**
 * A quantity or a percent as printed (decimal text from the backend): exactly, with every decimal it has and none it
 * doesn't, thousands separators, read left to right: "16.667", "1,200".
 */
export function Num({ value }) {
  return <bdi dir="ltr">{formatDecimal(Big(value))}</bdi>;
}

/** An amount of money as printed: rounded half up to two decimals, read left to right: "5,499.98", "66.00". */
export function Amount({ value }) {
  return <bdi dir="ltr">{formatAmount(value)}</bdi>;
}

/** The text as a CSS string's content, between double quotes; "<" escaped too, so it can't end the <style> element. */
const cssString = (text) => String(text).replace(/[\\"]/g, '\\$&').replace(/</g, '\\3c ').replace(/[\r\n]+/g, ' ');

/**
 * The end of a printout: the recipient's signature, room for the company's stamp, and who prepared it.
 *
 * @param preparedLabel "أعدها" for a فاتورة, "أعده" for a سند
 */
export function Signatures({ preparedLabel, preparedBy }) {
  return <div className="signatures">
    <div className="signature">توقيع المستلم: ....................</div>
    <div className="stamp" aria-hidden="true" />
    <div className="signature">{preparedLabel}: {preparedBy}</div>
  </div>;
}

/**
 * A label and its number (a phone, a registration number), kept on one line, the number left to right as it's
 * written: "0225678900 - 01112223334" or "512-334-876" in the order it was typed.
 */
function Labelled({ label, number }) {
  return <span className="nowrap">{label}: <bdi dir="ltr">{number}</bdi></span>;
}

/**
 * A printed document on A5 paper (app/(print)/print.css): the company's details and logo (the settings page), the
 * document's title and number, the customer or supplier, the document's details, then its own content (children).
 * Every page ends with the document's title and number, the customer's or supplier's name, and "صفحة X من Y". A draft
 * is marked مسودة across every page.
 *
 * The print dialog opens by itself once the document, the company's details and the logo have loaded; ?print=no in
 * the address stops it (to look at the page first). Closing the dialog leaves the page, with a button to print again.
 *
 * @param title   e.g. "فاتورة مبيعات"
 * @param number  the document's number; null while it loads
 * @param isDraft whether it's unposted: marked مسودة
 * @param party   { label, contact: { name, address, phone, taxRegistrationNo } }: e.g. the customer
 * @param details [{ label, value }]: the date, the warehouse...
 * @param error   the document's loading error, shown instead of it
 */
export default function PrintDocument({ title, number, isDraft, party, details = [], error, children }) {
  const { data: company, error: companyError } = useSWR(SETTINGS_URL, fetchJson, { revalidateOnFocus: false });
  const [logoSettled, setLogoSettled] = useState(false);
  const printed = useRef(false);
  const loaded = number != null && company != null;
  const readyToPrint = loaded && (!company.hasLogo || logoSettled);

  // The tab's title, which is also the name "Save as PDF" offers
  useEffect(() => {
    if (number != null) {
      document.title = `${title} ${number}`;
    }
  }, [title, number]);

  useEffect(() => {
    if (!readyToPrint || printed.current || new URLSearchParams(window.location.search).get('print') === 'no') {
      return;
    }
    printed.current = true;
    // After the font has loaded, or the first pages would be laid out in another font
    document.fonts.ready.then(() => window.print());
  }, [readyToPrint]);

  const loadError = error ?? companyError;
  if (loadError) {
    return <div className="message" role="alert">{loadError.message}</div>;
  }
  if (!loaded) {
    return <div className="message">جاري التحميل…</div>;
  }

  const contact = party.contact;

  return <>
    <div className="toolbar no-print">
      <button type="button" onClick={() => window.print()}>طباعة</button>
      <span className="hint">ورق A5 طولي؛ ألغِ &quot;الرؤوس والتذييلات&quot; في إعدادات الطباعة</span>
      {!company.companyName && <span className="warning">أدخل بيانات الشركة من صفحة الإعدادات</span>}
    </div>
    {/* Every page's foot: the margin boxes of @page, which only CSS can fill */}
    <style>{`@page { @bottom-center {
      content: "${cssString(`${title} رقم ${number} - ${contact.name} - صفحة `)}" counter(page) " من " counter(pages);
      font-family: var(--font-cairo), sans-serif; font-size: 7.5pt; color: #555; } }`}</style>

    <div className="sheet">
      {isDraft && <div className="watermark" aria-hidden="true">مسودة</div>}

      <header className="head">
        <div className="company">
          {company.companyName && <div className="company-name">{company.companyName}</div>}
          {company.companyAddress && <div className="company-line">{company.companyAddress}</div>}
          {company.companyPhones && <div className="company-line">
            <Labelled label="ت" number={company.companyPhones} />
          </div>}
          {company.companyTaxRegistrationNo && <div className="company-line">
            <Labelled label="رقم التسجيل الضريبي" number={company.companyTaxRegistrationNo} />
          </div>}
          {company.companyCommercialRegisterNo && <div className="company-line">
            <Labelled label="سجل تجاري" number={company.companyCommercialRegisterNo} />
          </div>}
        </div>
        <div className="doc-title">
          <h1>{title}</h1>
          <div>رقم <strong>{number}</strong></div>
          {isDraft && <div className="draft-tag">مسودة</div>}
        </div>
        {company.hasLogo &&
          // eslint-disable-next-line @next/next/no-img-element -- the backend's image, not a static one
          <img className="logo" src={LOGO_URL} alt="" onLoad={() => setLogoSettled(true)}
            onError={() => setLogoSettled(true)} />}
      </header>

      <section className="info">
        <div className="party">
          <span className="party-label">{party.label}: </span>
          <span className="party-name">{contact.name}</span>
          {contact.address && <div>{contact.address}</div>}
          {contact.phone && <div><Labelled label="ت" number={contact.phone} /></div>}
          {contact.taxRegistrationNo && <div>
            <Labelled label="رقم التسجيل الضريبي" number={contact.taxRegistrationNo} />
          </div>}
        </div>
        <table className="meta">
          <tbody>
            {details.map(({ label, value }) => <tr key={label}><th>{label}</th><td>{value}</td></tr>)}
          </tbody>
        </table>
      </section>

      {children}
    </div>
  </>;
}
