/**
 * みんなの伊東市 - 議員向けご意向伺いフォーム自動生成スクリプト
 *
 * 使い方:
 *   1. https://script.google.com で新規プロジェクトを作成
 *   2. このコードをすべてコピペ
 *   3. 上部メニュー「実行 ▷」ボタンで createOutreachForm() を実行
 *   4. 初回は権限承認を求められる → 承認する
 *   5. 実行ログに「✅ フォーム作成完了！」と回答URLが表示される
 *   6. そのURLを各議員に送付
 *
 * 回答はGoogleスプレッドシートに自動集計されます。
 */

function createOutreachForm() {
  const form = FormApp.create('みんなの伊東市 - 議員向けご意向伺い');

  form.setDescription([
    '伊東市議会議員の大竹 圭でございます。',
    '',
    'このたび、市民の皆さまに伊東市議会の活動をわかりやすくお伝えする',
    '情報サイト「みんなの伊東市」を、議員活動の一環として個人で公開する',
    '準備を進めております。',
    '',
    '【サイトの位置づけ】',
    '・伊東市・伊東市議会の公式サイトではなく、大竹圭が個人の責任で運営する非公式サイトです',
    '・議員を評価・ランク付けしたり、選挙運動を行うものではありません',
    '・公開済みの議会動画・議事録を整理して、議員別・テーマ別に検索できるようにしたものです',
    '',
    '【サイトプレビュー】',
    'https://all-ito-city.com/',
    '',
    '正式公開に先立ち、ご自身に関する掲載内容について、',
    'ご意向を伺いたく、ご協力をお願いいたします。',
    '',
    '所要時間：3〜5分',
    '回答期限：[ここに期限を記入]',
    '',
    '※ ご回答いただいた後でも、いつでも掲載内容の変更・削除をご依頼いただけます',
  ].join('\n'));

  form.setCollectEmail(true);  // 回答者のメールを収集
  form.setLimitOneResponsePerUser(false);  // 複数回答可
  form.setAllowResponseEdits(true);  // 編集可能

  // ===== Q1: お名前 =====
  form.addTextItem()
    .setTitle('お名前')
    .setHelpText('議員様のお名前をご記入ください（例：大竹 圭）')
    .setRequired(true);

  // ===== Q2: 情報掲載の可否 =====
  const q2 = form.addMultipleChoiceItem();
  q2.setTitle('Q1. ご自身の情報の掲載可否')
    .setHelpText('議会議事録・動画から抽出した質問内容・所属会派・委員会等の情報を掲載することへのご意向をお聞かせください。')
    .setRequired(true)
    .setChoices([
      q2.createChoice('① 全面的に同意する'),
      q2.createChoice('② 一部修正のうえ同意する'),
      q2.createChoice('③ 同意しない（お名前のみの表示にとどめる）'),
    ]);

  // ===== Q3: 修正希望箇所（任意） =====
  form.addParagraphTextItem()
    .setTitle('Q1-2. 修正希望箇所（②を選んだ方）')
    .setHelpText('修正したい箇所がございましたらご記入ください。')
    .setRequired(false);

  // ===== Q4: 写真掲載 =====
  const q4 = form.addMultipleChoiceItem();
  q4.setTitle('Q2. 議員写真の掲載')
    .setHelpText('ご本人のお写真をサイトに掲載することについてのご意向をお聞かせください。\n※ 同意いただけない場合、苗字の頭文字を丸印で表示します。')
    .setRequired(true)
    .setChoices([
      q4.createChoice('① 写真を掲載してほしい（写真を別途お送りします）'),
      q4.createChoice('② 既存の公開写真（議会公式・選挙公報等）の使用に同意'),
      q4.createChoice('③ 写真は掲載しない'),
    ]);

  // ===== Q5: 一言メッセージ =====
  const q5 = form.addMultipleChoiceItem();
  q5.setTitle('Q3. 議員からの一言メッセージの掲載')
    .setHelpText('市民の皆さまへの一言メッセージ（活動方針・重点政策・市政への思い等）をご自身の議員ページに掲載することができます。')
    .setRequired(true)
    .setChoices([
      q5.createChoice('① メッセージを掲載してほしい（下記に本文をご記入ください）'),
      q5.createChoice('② メッセージは掲載しない'),
    ]);

  // ===== Q5-2: メッセージ本文 =====
  form.addParagraphTextItem()
    .setTitle('Q3-2. メッセージ本文（①を選んだ方）')
    .setHelpText('200文字程度を目安にご記入ください。')
    .setRequired(false);

  // ===== Q6: 連絡先・SNS =====
  form.addSectionHeaderItem()
    .setTitle('Q4. 連絡先・SNS等の掲載')
    .setHelpText('ご自身の議員活動に関する公開連絡先をサイトに掲載することができます。\n掲載をご希望のものだけご記入ください。空欄の項目は掲載しません。');

  form.addTextItem()
    .setTitle('公式ホームページ URL')
    .setRequired(false);

  form.addTextItem()
    .setTitle('X (Twitter) URL')
    .setRequired(false);

  form.addTextItem()
    .setTitle('Facebook URL')
    .setRequired(false);

  form.addTextItem()
    .setTitle('Instagram URL')
    .setRequired(false);

  form.addTextItem()
    .setTitle('その他のSNS・連絡先')
    .setHelpText('YouTube・公式LINE・後援会連絡先など')
    .setRequired(false);

  // ===== Q7: 自由記入 =====
  form.addParagraphTextItem()
    .setTitle('Q5. その他ご意見・ご要望（自由記入）')
    .setHelpText('上記4項目以外で、サイトに関するご懸念事項・ご要望・ご質問等がございましたらご自由にご記入ください。')
    .setRequired(false);

  // ===== 連絡先のフッター =====
  form.addSectionHeaderItem()
    .setTitle('ご回答ありがとうございました')
    .setHelpText([
      '',
      'ご回答内容は、サイトの該当箇所に反映いたします。',
      '反映に1〜数日いただく場合がございます。',
      '',
      '【お問い合わせ】',
      '伊東市議会議員 大竹 圭',
      'E-mail: ka@oh-life.co.jp',
      '',
      '【掲載後の変更・削除のご依頼】',
      'いつでも上記までご連絡ください。原則48時間以内に対応いたします。',
    ].join('\n'));

  // ===== スプレッドシートに集計 =====
  const ss = SpreadsheetApp.create('みんなの伊東市 - 議員ご意向回答');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  const responderUrl = form.getPublishedUrl();
  const editUrl = form.getEditUrl();
  const ssUrl = ss.getUrl();

  Logger.log('============================================');
  Logger.log('✅ フォーム作成完了！');
  Logger.log('============================================');
  Logger.log('');
  Logger.log('【議員に送るURL（回答用）】:');
  Logger.log(responderUrl);
  Logger.log('');
  Logger.log('【フォーム編集用URL（あなただけ）】:');
  Logger.log(editUrl);
  Logger.log('');
  Logger.log('【回答集計スプレッドシート】:');
  Logger.log(ssUrl);
  Logger.log('');
  Logger.log('議員に送るのは「回答用URL」です。');
  Logger.log('============================================');
}
