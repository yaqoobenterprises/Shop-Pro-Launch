import {readFileSync} from "node:fs";
import {receiptFixtureSql,readIds as i} from "./aqvoraReceiptFixture";
export {readIds} from "./aqvoraReceiptFixture";
export const currencyMigrations=[
  "20261121052824_aqvora_currency_policy_schema.sql",
  "20261121052830_aqvora_currency_source_binding.sql",
  "20261121052834_aqvora_currency_posting.sql",
  "20261121052837_aqvora_currency_certification.sql",
  "20261121053158_aqvora_currency_journal.sql",
  "20261121053320_aqvora_currency_source_certification.sql",
];
export const currencyMigrationSql=()=>currencyMigrations.map(f=>
  readFileSync(new URL(`../../supabase/migrations/${f}`,import.meta.url),"utf8")).join("\n");
/** Synthetic approval only. Never a seed, default or country/accountant approval. */
export const currencySeedSql=(org=i.org,owner=i.owner,currency="PKR",exponent=2,revision=1,date="2026-01-01")=>`
  INSERT INTO private.aqvora_currency_policies(organization_id,revision,currency,exponent,effective_from,
    authority_reference,authority_revision,approval_reference,approved_by)
  VALUES('${org}',${revision},'${currency}',${exponent},'${date}',
    'TEST ONLY: ISO 4217 reference fixture, not production authorization','synthetic-v1',
    'TEST ONLY: synthetic owner approval','${owner}');
`;
export const currencyFixtureSql=()=>receiptFixtureSql()+currencyMigrationSql()+currencySeedSql()+
  currencySeedSql(i.otherOrg,i.outsider);
