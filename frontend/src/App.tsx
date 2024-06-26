import { useState, useEffect, useRef, useCallback } from 'react';
import { bitable, ITable, IAttachmentField, Selection } from "@lark-base-open/js-sdk";
import { Button, Divider, Image, Space, Typography, Toast, Spin, Form, Card, Tooltip, Popconfirm, Banner, Input} from '@douyinfe/semi-ui';
import { IconLink } from '@douyinfe/semi-icons';

import imageCompression from 'browser-image-compression';
import { cloneDeep, debounce } from "lodash";
import { IconInfoCircle } from "@douyinfe/semi-icons";
import './App.css';

import { useTranslation, Trans } from 'react-i18next';



// 定义类型
type ImageItem = {
  url: string;
  file: File;
  name: string;
  size: number;
  type: string;
  token: string;
  timeStamp: number;
};




type ImageRecordList = {
  fieldId: string;
  recordId: string;
  images: ImageItem[];
};



const formatFileSize = (fileSizeInBytes: number): string => {
  if (fileSizeInBytes < 1024) {
    return fileSizeInBytes + " B";
  } else if (fileSizeInBytes < 1024 * 1024) {
    return (fileSizeInBytes / 1024).toFixed(2) + " KB";
  } else if (fileSizeInBytes < 1024 * 1024 * 1024) {
    return (fileSizeInBytes / (1024 * 1024)).toFixed(2) + " MB";
  } else {
    return (fileSizeInBytes / (1024 * 1024 * 1024)).toFixed(2) + " GB";
  }
};


const WHITE_LIST: string[] = ['jpeg', 'png', 'webp', 'bmp', 'jpg']



export default function App() {

  const [imageRecordList, setImageRecordList] = useState<ImageRecordList[]>([]); // 
  const [compressNum, setCompressNum] = useState<number>(60);
  const [pattern, setPattern] = useState<string>('cell');
  const [loading, setLoading] = useState<boolean>(false);

  const tableRef = useRef<ITable | null>(null);
  const selectionFieldRef = useRef<IAttachmentField | null>(null);
  const lastFieldIdRef = useRef<string | null>(null);

  const { t } = useTranslation();


  const isFetchingRef = useRef(false); // 用于标记是否正在获取数据



  const patternRef = useRef(pattern); // 使用 useRef 来跟踪 pattern 的最新值

  const [inputLongUrl, setInputLongUrl] = useState('');
  const [outputShorUrl, setOutputShorUrl] = useState('');
  const { Paragraph, Text } = Typography;

  const handleClick = async () => {
    const shortUrl = await getShorUrl(inputLongUrl);
    setOutputShorUrl(shortUrl);
  };

  // 调用生成短链接接口
  async function getShorUrl(longUrl: string): Promise<string> {

    const formData = new FormData();
    formData.append('long_url', longUrl);

    const response = await fetch('/api/shorten_url', {
      method: 'POST',
      body: formData
    });
    if (!response.ok) {
      throw new Error('Network response was not ok.');
    }
    const responseData = await response.json();
    console.log(responseData.code, responseData.short_url);
    console.log("getShorUrl Response Data:", responseData);
    return responseData.short_url;
  }

  const copyToClipboard = () => {
    console.log('outputShorUrl: ', outputShorUrl);
    navigator.clipboard.writeText(outputShorUrl);
    alert('Copied to clipboard!');
  }

  useEffect(() => {
    const init = async () => {
      try {
        bitable.base.onSelectionChange(
          handleSelectionChange
          // debounce(handleSelectionChange, 100) // 使用 lodash 的 debounce 方法
        );
      } catch (e) {
        console.log(e);
      }
    };
    init();
    handleSelectionChange()
  }, []);


  const handleSelectionChange = useCallback(async () => {
    console.log('handleSelectionChange');
    
    if (isFetchingRef.current) {
      console.log("Previous fetch in progress, cancelling...");
      return; // 如果正在获取数据，则取消
    }
    const currentSelection = await bitable.base.getSelection();
    console.log(currentSelection)


    if (currentSelection.fieldId && currentSelection.recordId) {
      if (patternRef.current === 'field' && lastFieldIdRef.current === currentSelection?.fieldId) {
        return;
      }
      lastFieldIdRef.current = currentSelection?.fieldId || null;
      getData(currentSelection);
    } else {
      setImageRecordList([]);
      setLoading(false);
    }
  }, []);



  const onPatternChange = async (pa: string) => {
    patternRef.current = pa; // 每次 pattern 更新时，更新其在 useRef 中的值

    await getData()
  }



  const getData = async (selection?: Selection) => {
    const currentPattern = patternRef.current; // 使用 useRef 中的最新值

    setLoading(true);

    try {

      const table: ITable = await bitable.base.getActiveTable();
      // tableRef.current = await bitable.base.getActiveTable();
      if (!selection) selection = await bitable.base.getSelection();


      // const selection = await bitable.base.getSelection();

      // if (!tableRef.current) {
      //   setImageRecordList([])
      //   setLoading(false);

      //   return;
      // }

      // if (!selection) {
      //   setImageRecordList([])
      //   setLoading(false);
      //   return;
      // }

      const field = await table.getField<IAttachmentField>(selection.fieldId as string);

      const meta = await field.getMeta()


      console.log(meta)

      if (!field || meta.type !== 17) {
        setImageRecordList([])
        setLoading(false);
        return;
      }


      selectionFieldRef.current = field;

      let recordList = [];



      if (currentPattern === 'cell') {
        recordList.push(selection.recordId);
      } else {
        const allRecords = await table.getRecordList();
        for (const record of allRecords) {
          recordList.push(record.id)
        }
      }



      try {
        const images: ImageRecordList[] = await Promise.all(recordList.map(async recordId => {
          let imgs: ImageItem[] = []

          const imgItems = await field.getValue(recordId as string);

          console.log(imgItems)


          if (imgItems) {

            imgs = await Promise.all(imgItems.filter((img: { type: string; }) => img.type.startsWith('image')).map(async img => {
              // console.log(img)
              const url = await table.getAttachmentUrl(img.token, selection?.fieldId as string, recordId as string) as string;
              console.log(url)

              const file = await fetchImageAsFile(url, img.name)
              return {
                ...img,
                url,
                file
              };
            }))
          }

          return {
            recordId: recordId as string,
            fieldId: selection?.fieldId as string,
            images: imgs
          };
        }));

        // console.log(images)

        const res: ImageRecordList[] = images.filter(item => item.images.length > 0)

        setImageRecordList(res); //选择变化的时候更新
      } catch (e) {
        console.log(e)
      }


    } catch (e) {
      console.error(e);
    } finally {
      isFetchingRef.current = false; // 完成获取数据
      setLoading(false);
    }
  };



  // 压缩
  const handleCompress = async () => {
    setLoading(true)
    const list = cloneDeep(imageRecordList)

    for (const record of list) {
      const arr: ImageItem[] = []
      for (let item of record.images) {

        let file: File | null = null


        if (WHITE_LIST.includes(item.type.split('/')[1])) {
          // TODO: 调用自己的api接口
          file = await doRemoveBgFromAPI(item.file, item.name);

          // file = await imageCompression(item.file, {
          //   maxSizeMB: 2,
          //   maxWidthOrHeight: 1024,
          //   useWebWorker: true,
          //   initialQuality: (100 - compressNum) / 100,
          //   alwaysKeepResolution: true
          // });
          // console.log("file: ", file)

        } else file = item.file

        arr.push({ ...item, file })

      }
      record.images = arr
    }

    setImageRecordList(list); // Update state with compressed images
    setLoading(false)
  };

  // 获取照片转File对象
  async function fetchImageAsFile(url: string, name: string): Promise<File> {
    // 使用 fetch 获取图片
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Network response was not ok.');
    }
    // 将响应转换为 Blob
    const blob = await response.blob();
    // 创建并返回 File 对象
    return new File([blob], name, { type: blob.type });
  }

  // 获取去除背景以后的照片转File对象
  async function doRemoveBgFromAPI(imageFile: File, name: string): Promise<File> {

    const formData = new FormData();
    formData.append('image', imageFile);

    const response = await fetch('/api/remove_image_bg', {
      method: 'POST',
      body: formData
    });
    if (!response.ok) {
      throw new Error('Network response was not ok.');
    }
    // 将响应转换为 Blob
    const blob = await response.blob();
    // 创建并返回 File 对象
    return new File([blob], name, { type: blob.type });
  }

  const confirmCompress = async () => {
    setLoading(true)
    try {

      const resArr: boolean[] = []

      for (let item of imageRecordList) {
        const fileList = item.images.map(file => new File([file.file], file.name, { type: file.type }))
        const res = await selectionFieldRef.current?.setValue(item.recordId as string, fileList)
        resArr.push(res as boolean)
      }

      Toast.info(resArr.includes(false) ? t('failed') : t('success'))
      setLoading(false)
    }
    catch (e) {
      setLoading(false)
      console.log(e)
    }

  }


  const ImageListEl = () => {
    // console.log(imageRecordList)

    // return <div>123123</div>
    return <>
      {
        imageRecordList.map(item => {
          // console.log(item)
          return item.images.map(img => {
            // console.log("img: ", img)
            let tmp_img = new globalThis.Image();
            tmp_img.src = URL.createObjectURL(img.file);
            return <Space vertical key={img.name}>
              <Image
              preview={false}
                width={100}
                height={100*tmp_img.height/tmp_img.width}
                src={tmp_img.src}
              />
              <Typography.Title heading={6} style={{ margin: '8px 0' }} >
                {formatFileSize(img.file.size)}
              </Typography.Title>
            </Space>
          })
        })
      }
    </>


  }

  return (
    <Spin spinning={loading}>
      <main className="main" >
        {/* <Banner
          type="info"
          description={t('banner') + '      ' + WHITE_LIST.join(' , ').toLocaleUpperCase() + '.' + t('banner_tip')}
        /> */}
        <Card >

          <Form onValueChange={values => {
            setPattern(values.pattern as string)
            setCompressNum(values.compressNum as number)

          }} initValues={{ compressNum, pattern }}>
          <Form.Section text={t('title')}>
              {/* <Form.Select field='pattern' label={t('mode')} onChange={e => onPatternChange(e as string)}>
                <Form.Select.Option value="cell">{t('cell')}</Form.Select.Option>
                <Form.Select.Option value="field">{t('field')}</Form.Select.Option>
              </Form.Select> */}
            </Form.Section>
          </Form>

          {/* <Space>
            <Button disabled={imageRecordList.length === 0 || loading} theme='solid' onClick={handleCompress} >{t('remove_bg')}</Button>
            <Popconfirm
              title={t('popconfirm')}
              onConfirm={confirmCompress}
            >
              <Button disabled={imageRecordList.length === 0 || loading} theme='solid' >{t('apply')}</Button>
            </Popconfirm>

          </Space>

          <Divider margin='12px'/> */}

          <Space>
            <IconLink />
            <Input 
              showClear defaultValue='click to clear'
              placeholder="请输入要缩短的长链接"
              value={inputLongUrl}
              onChange={(e) => setInputLongUrl(e)}
            />
            <Button onClick={handleClick}>生成短链接</Button>

            {/* <button onClick={copyToClipboard}>Copy to Clipboard</button> */}
          </Space>
          <div>
            <br />
            <Paragraph copyable={{ content: outputShorUrl, onCopy: () => Toast.success({ content: '复制文本成功' }) }}>
               <span ><Text strong>{`短链接：`}</Text><span>{outputShorUrl}</span> </span> 
            </Paragraph>

          </div>
          
        </Card>
{/* 
        <Divider margin='12px' />

        {
          imageRecordList.length > 0 ? <ImageListEl /> : ` ${pattern === 'cell' ? t('text_cell') : t('text_field')}`
        }

        <Divider margin='12px' /> */}

      </main>
    </Spin>
  )
}