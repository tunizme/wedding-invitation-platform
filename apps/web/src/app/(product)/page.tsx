import Image from 'next/image';
import { CatalogLink } from '../../ui/product/catalog-link';
import { ArrowRight } from 'lucide-react';
import styles from '../../ui/product/home.module.css';

export default function HomePage() {
  return (
    <main className={styles.home}>
      <section className={styles.hero}>
        <div className={styles.copy}>
          <p className={styles.eyebrow}>CHO NGÀY MÌNH VỀ CHUNG ĐÔI</p>
          <h1>
            Lời mời nhỏ. <br />
            Ngày <em>thật lớn.</em>
          </h1>
          <p>
            Từ những điều giản dị của hai bạn,
            <br className={styles.desktopOnly} />
            tạo nên tấm thiệp mang một câu chuyện riêng.
          </p>
          <CatalogLink className={styles.primary}>
            Khám phá mẫu cưới <ArrowRight size={18} aria-hidden="true" />
          </CatalogLink>
          <span className={styles.note}>
            Chọn một mẫu. Thêm câu chuyện. Gửi lời thương.
          </span>
        </div>
        <div
          className={styles.showcase}
          aria-label="Hình ảnh minh họa phong cách lời mời"
        >
          {['two', 'one', 'three'].map((name, index) => (
            <div
              key={name}
              aria-hidden="true"
              className={`${styles.card} ${styles[`card${index}`]}`}
            >
              <div className={styles.coverType}>
                <span className={styles.cardCaption}>THE WEDDING OF</span>
                <span className={styles.cardNames}>
                  Ngọc Anh<i>&</i>Minh Quân
                </span>
                <span className={styles.coverDate}>20 . 12 . 2026</span>
              </div>
              <Image
                src={`/branding/couple-${name}.jpg`}
                width={320}
                height={420}
                alt=""
                priority={index === 1}
              />
              <span className={styles.coverFoot}>
                MỘT NGÀY, MỘT ĐỜI, MỘT CHÚNG MÌNH.
              </span>
            </div>
          ))}
          <svg
            className={styles.botanical}
            viewBox="0 0 100 120"
            aria-hidden="true"
          >
            <path
              d="M25 110Q58 67 57 12M48 67Q15 57 16 30Q45 35 48 67M55 43Q87 40 86 15Q62 19 55 43M38 89Q66 97 82 69Q52 69 38 89"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
            />
          </svg>
          <span className={styles.showcaseCaption}>
            a little invitation, a beautiful beginning.
          </span>
          <p className={styles.illustration}>
            Hình ảnh minh họa · Khám phá mẫu trong kho thiệp
          </p>
        </div>
      </section>
      <section className={styles.styleStrip} aria-label="Phong cách lời mời">
        <span>MỘT PHONG CÁCH, MỘT DẤU ẤN</span>
        {['Tối giản', 'Truyền thống', 'Thiên nhiên', 'Editorial'].map(
          (name) => (
            <CatalogLink key={name}>
              {name}
              <ArrowRight size={15} aria-hidden="true" />
            </CatalogLink>
          ),
        )}
      </section>
      <section className={styles.featured}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>GỢI Ý TỪ TIỆM</p>
            <h2>Một lời mời vừa vặn với hai bạn.</h2>
          </div>
          <CatalogLink>
            Khám phá kho mẫu <ArrowRight size={17} aria-hidden="true" />
          </CatalogLink>
        </div>
        <p className={styles.note}>
          Phong cách minh họa · Chọn mẫu có sẵn trong kho thiệp.
        </p>
        <div className={styles.featureGrid}>
          {[
            ['one', 'Một ngày chung đôi', 'Tối giản · Editorial'],
            ['two', 'Lời thương màu đỏ', 'Truyền thống · Trang trọng'],
            ['three', 'Dưới tán xanh', 'Thiên nhiên · Botanical'],
            ['two', 'Chuyện của chúng mình', 'Editorial · Đen trắng'],
          ].map(([photo, title, caption]) => (
            <article key={title}>
              <CatalogLink
                className={styles.featureCover}
                aria-label={`Khám phá phong cách ${title}`}
              >
                <span className={styles.cardCaption}>THE WEDDING OF</span>
                <span className={styles.cardNames}>
                  Ngọc Anh <i>&</i> Minh Quân
                </span>
                <Image
                  src={`/branding/couple-${photo}.jpg`}
                  width={320}
                  height={400}
                  alt=""
                />
                <span className={styles.cardCaption}>
                  MỘT NGÀY, MỘT ĐỜI, MỘT CHÚNG MÌNH.
                </span>
              </CatalogLink>
              <h3>{title}</h3>
              <p>{caption}</p>
            </article>
          ))}
        </div>
      </section>
      <section className={styles.statement}>
        <p className={styles.eyebrow}>KHÔNG CHỈ LÀ MỘT TẤM THIỆP</p>
        <h2>
          Là cách bạn nói:
          <br />
          <em>“Có bạn, ngày này sẽ đẹp hơn.”</em>
        </h2>
        <p>
          Ảnh của hai bạn. Những dòng kể của hai bạn.
          <br />
          Một lời mời được gửi đi bằng sự chân thành.
        </p>
      </section>
      <section className={styles.steps} aria-labelledby="home-steps">
        <p className={styles.eyebrow}>TỪ MỘT Ý THÍCH, ĐẾN MỘT LỜI MỜI</p>
        <h2 id="home-steps">Ba bước. Một ngày đáng nhớ.</h2>
        <div className={styles.stepGrid}>
          {[
            [
              '01',
              'Chọn một mẫu yêu thích',
              'Tìm phong cách phù hợp với câu chuyện của hai bạn.',
            ],
            [
              '02',
              'Thêm những điều của riêng mình',
              'Điền thông tin, chọn ảnh và xem trước lời mời.',
            ],
            [
              '03',
              'Gửi thiệp, đón yêu thương',
              'Xuất bản thiệp và chia sẻ đường dẫn tới những người thân yêu.',
            ],
          ].map(([number, title, text]) => (
            <article key={number}>
              <span>{number}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
        <CatalogLink className={styles.primary}>
          Tìm mẫu của hai bạn <ArrowRight size={18} aria-hidden="true" />
        </CatalogLink>
      </section>
      <section className={styles.finalCta}>
        <p className={styles.eyebrow}>MỘT CHƯƠNG MỚI ĐANG CHỜ</p>
        <h2>Bắt đầu từ một lời mời.</h2>
        <CatalogLink className={styles.primary}>
          Tạo tấm thiệp của bạn <ArrowRight size={18} aria-hidden="true" />
        </CatalogLink>
      </section>
    </main>
  );
}
