-- ============================================================================
-- Coffer 凭证管理器 · 数据库设计 v1
-- 环境：MySQL 8.0+（utf8mb4 / InnoDB）
--
-- 存储口径（零知识）：
--   1. 所有敏感内容由客户端加密后上传，云端只存密文，不含明文、不含密钥；
--   2. 字段名带 _cipher 的列存放的是客户端加密结果（密文 JSON / 密文块），
--      服务端只做存储与转发，永远无法解密；
--   3. 登录与解锁使用单一主密码，服务端仅保存 SRP 验证器，不保存可反推
--      主密码的任何信息；
--   4. 修改主密码 = 全库重加密：user.key_version 自增，并将全部 item /
--      attachment 的 key_version 更新为新版本。
--
-- 加密实现规范见《功能设计说明-v1.md》附录 A：
--   密钥派生：Argon2id(主密码, enc_salt) → 256 位 KEK（仅存客户端内存）
--   数据加密：AES-256-GCM，密文格式 "v1." + Base64(Nonce(12B)‖密文‖Tag(16B))
--   登录认证：SRP-6a（auth_salt / auth_verifier），主密码与哈希均不上网络
--
-- 基础字段规范（所有业务表统一携带）：
--   status     角色状态（0正常 1停用）
--   del_flag   删除标志（0存在 2删除）
--   create_by / create_time / update_by / update_time / remark
--
-- 逻辑关系（不建物理外键，由应用层维护）：
--   sys_user 1 - N vault_folder
--   sys_user 1 - N vault_item   N - 1 vault_folder（folder_id 为空 = 未分类）
--   vault_item 1 - N vault_attachment
-- ============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------------------------------------------------------
-- 1. 用户表 sys_user
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS sys_user;
CREATE TABLE sys_user (
  user_id       BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '用户ID（主键）',
  email         VARCHAR(128)     NOT NULL                COMMENT '登录邮箱（唯一，明文，用于登录标识）',
  nickname      VARCHAR(64)      DEFAULT ''              COMMENT '昵称（明文展示；如需严格零知识可改为 nickname_cipher）',
  avatar        VARCHAR(255)     DEFAULT ''              COMMENT '头像对象存储 key（客户端加密后的密文图片），空 = 文字头像',
  avatar_color  CHAR(6)          DEFAULT '125B4A'        COMMENT '文字头像底色（HEX，如 125B4A）',
  auth_salt     VARCHAR(64)      NOT NULL                COMMENT 'SRP 认证盐（注册时随机生成，16B Hex；见功能设计说明附录 A）',
  auth_verifier VARCHAR(512)     NOT NULL                COMMENT 'SRP 验证器 v = g^x mod N（服务端不可反推主密码）',
  enc_salt      VARCHAR(64)      NOT NULL                COMMENT '密钥派生盐（客户端随机生成；与主密码一起经 Argon2id 派生数据加密密钥 KEK，与 SRP 派生链分离）',
  key_version   INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '当前数据密钥版本（修改主密码全库重加密后 +1）',
  status        CHAR(1)          DEFAULT '0'             COMMENT '角色状态（0正常 1停用）',
  del_flag      CHAR(1)          DEFAULT '0'             COMMENT '删除标志（0存在 2删除）',
  create_by     VARCHAR(64)      DEFAULT ''              COMMENT '创建者',
  create_time   DATETIME         DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by     VARCHAR(64)      DEFAULT ''              COMMENT '更新者',
  update_time   DATETIME         DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  remark        VARCHAR(500)     DEFAULT NULL            COMMENT '备注',
  PRIMARY KEY (user_id),
  UNIQUE KEY uk_email (email)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='用户信息表';

-- ----------------------------------------------------------------------------
-- 2. 文件夹表 vault_folder
--    说明：文件夹名对用户可见，但按零知识口径以密文存储，客户端解密后展示
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS vault_folder;
CREATE TABLE vault_folder (
  folder_id          BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '文件夹ID（主键）',
  user_id            BIGINT UNSIGNED  NOT NULL                COMMENT '所属用户ID（逻辑关联 sys_user.user_id）',
  folder_name_cipher VARBINARY(1024)  NOT NULL                COMMENT '文件夹名密文（客户端加密）',
  folder_color       CHAR(6)          DEFAULT '125B4A'        COMMENT '文件夹颜色（HEX，仅用于 UI 圆点，不泄露内容）',
  sort_no            INT UNSIGNED     NOT NULL DEFAULT 0      COMMENT '排序号（小在前）',
  status             CHAR(1)          DEFAULT '0'             COMMENT '角色状态（0正常 1停用）',
  del_flag           CHAR(1)          DEFAULT '0'             COMMENT '删除标志（0存在 2删除）',
  create_by          VARCHAR(64)      DEFAULT ''              COMMENT '创建者',
  create_time        DATETIME         DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64)      DEFAULT ''              COMMENT '更新者',
  update_time        DATETIME         DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  remark             VARCHAR(500)     DEFAULT NULL            COMMENT '备注',
  PRIMARY KEY (folder_id),
  KEY idx_user_sort (user_id, sort_no)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='凭证文件夹表';

-- ----------------------------------------------------------------------------
-- 3. 凭证条目表 vault_item
--    item_type：0 账号 / 1 卡片证件 / 2 安全笔记（决定客户端表单，云端不感知含义）
--    条目各字段（用户名/密码/网址/卡号/证件号/有效期/PIN/正文等）整体作为
--    JSON 由客户端加密后存入 data_cipher，云端无字段级明文
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS vault_item;
CREATE TABLE vault_item (
  item_id      BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '凭证条目ID（主键）',
  user_id      BIGINT UNSIGNED  NOT NULL                COMMENT '所属用户ID（逻辑关联 sys_user.user_id）',
  folder_id    BIGINT UNSIGNED  DEFAULT NULL            COMMENT '所属文件夹ID（NULL = 未分类；逻辑关联 vault_folder.folder_id）',
  item_type    CHAR(1)          NOT NULL DEFAULT '0'    COMMENT '条目类型（0账号 1卡片证件 2安全笔记）',
  name_cipher  VARBINARY(1024)  NOT NULL                COMMENT '条目名称密文（列表标题，客户端解密展示）',
  data_cipher  MEDIUMTEXT       NOT NULL                COMMENT '条目内容密文（客户端加密的 JSON：账号=用户名/密码/网址；卡片=卡号/证件号/有效期/PIN；笔记=正文）',
  fav_flag     CHAR(1)          NOT NULL DEFAULT '0'    COMMENT '收藏标志（0未收藏 1已收藏）',
  key_version  INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '加密时的密钥版本（与 sys_user.key_version 比对判断是否需要重加密）',
  deleted_time DATETIME         DEFAULT NULL            COMMENT '移入回收站时间（del_flag=2 时起算 30 天保留期，到期物理清除）',
  status       CHAR(1)          DEFAULT '0'             COMMENT '角色状态（0正常 1停用）',
  del_flag     CHAR(1)          DEFAULT '0'             COMMENT '删除标志（0存在 2删除/回收站）',
  create_by    VARCHAR(64)      DEFAULT ''              COMMENT '创建者',
  create_time  DATETIME         DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by    VARCHAR(64)      DEFAULT ''              COMMENT '更新者',
  update_time  DATETIME         DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  remark       VARCHAR(500)     DEFAULT NULL            COMMENT '备注',
  PRIMARY KEY (item_id),
  KEY idx_user_folder (user_id, folder_id),
  KEY idx_user_type (user_id, item_type),
  KEY idx_user_fav (user_id, fav_flag),
  KEY idx_user_del (user_id, del_flag, deleted_time)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='凭证条目表';

-- ----------------------------------------------------------------------------
-- 4. 图片附件表 vault_attachment
--    附件是任意条目都可挂载的加密图片（名单截图、卡片正反面等）
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS vault_attachment;
CREATE TABLE vault_attachment (
  attach_id        BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT COMMENT '附件ID（主键）',
  item_id          BIGINT UNSIGNED  NOT NULL                COMMENT '所属凭证条目ID（逻辑关联 vault_item.item_id）',
  user_id          BIGINT UNSIGNED  NOT NULL                COMMENT '所属用户ID（冗余，便于按用户统计与清理）',
  file_name_cipher VARBINARY(1024)  DEFAULT NULL            COMMENT '原始文件名密文（客户端加密）',
  mime_type        VARCHAR(64)      DEFAULT ''              COMMENT '文件 MIME 类型（明文，如 image/jpeg，不泄露内容）',
  file_size        BIGINT UNSIGNED  NOT NULL DEFAULT 0      COMMENT '密文文件大小（字节）',
  object_key       VARCHAR(255)     NOT NULL                COMMENT '对象存储 key（云端只存密文文件，建议限私有读写）',
  file_sha256      CHAR(64)         DEFAULT ''              COMMENT '密文文件 SHA-256（完整性校验）',
  key_version      INT UNSIGNED     NOT NULL DEFAULT 1      COMMENT '加密时的密钥版本',
  deleted_time     DATETIME         DEFAULT NULL            COMMENT '移入回收站时间（跟随条目删除）',
  status           CHAR(1)          DEFAULT '0'             COMMENT '角色状态（0正常 1停用）',
  del_flag         CHAR(1)          DEFAULT '0'             COMMENT '删除标志（0存在 2删除）',
  create_by        VARCHAR(64)      DEFAULT ''              COMMENT '创建者',
  create_time      DATETIME         DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by        VARCHAR(64)      DEFAULT ''              COMMENT '更新者',
  update_time      DATETIME         DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  remark           VARCHAR(500)     DEFAULT NULL            COMMENT '备注',
  PRIMARY KEY (attach_id),
  KEY idx_item (item_id),
  KEY idx_user (user_id)
) ENGINE=InnoDB AUTO_INCREMENT=1 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci COMMENT='凭证图片附件表';

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- 设计说明
-- ============================================================================
-- 1. 为什么内容字段全是密文：零知识口径下服务端不持有密钥，搜索、收藏、
--    类型筛选等操作所需的明文信息由客户端解密后在内存完成，v1 不做服务端
--    加密索引（功能地图已列为不做项）。
-- 2. 回收站：删除条目 = del_flag 置 2 + 记录 deleted_time；定时任务扫描
--    deleted_time 超过 30 天的记录执行物理删除（含对象存储中的密文文件）。
-- 3. 修改主密码（全库重加密）：事务内 sys_user.key_version +1，逐条解密
--    （客户端）→ 新密钥重加密 → 更新 data_cipher / name_cipher 及
--    key_version；附件同理。历史版本不做云端保留。
-- 4. 未分类：vault_item.folder_id 为 NULL 即「未分类」，不依赖一条虚拟记录；
--    文件夹删除时将其下条目 folder_id 置 NULL（应用层处理）。
-- 5. status/del_flag 等基础字段沿用统一规范，业务上暂未用到停用态，保留
--    是为后续账号封禁、条目归档留口子。
-- ============================================================================
